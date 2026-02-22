# ClickHouse + Agent 问题修复实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复 refactor/clickhouse 分支 review 中识别的 P0/P1/P2 级别问题，提升系统在 ClickHouse 故障场景下的健壮性。

**Architecture:** 最小化改动原则——每个修复只改动其直接相关代码，不做额外重构。修复后运行现有测试确认无回归。

**Tech Stack:** TypeScript (Node.js, vitest), Go (1.21+), POSIX sh

---

## Task 1：ClickHouseWriter 增加运行时健康追踪（P0-1）

**Files:**
- Modify: `apps/collector/src/modules/clickhouse/clickhouse.writer.ts`
- Modify: `apps/collector/src/modules/collector/batch-buffer.ts`
- Modify: `apps/collector/src/modules/stats/stats-write-mode.ts`
- Modify: `apps/collector/src/modules/stats/stats-write-mode.test.ts`

**背景：** `isEnabled()` 是静态配置判断，CH 宕机时仍返回 true，导致 SQLite 写入被错误跳过而 CH 写入失败，数据双丢失。

**Step 1：在 `ClickHouseWriter` 中增加健康追踪字段和方法**

在 `clickhouse.writer.ts` 中，于 `pendingBatches = 0;` 下方增加：

```typescript
private consecutiveFailures = 0;
private readonly maxConsecutiveFailures = Math.max(
  1,
  Number.parseInt(process.env.CH_UNHEALTHY_THRESHOLD || '5', 10) || 5,
);
```

在 `isEnabled()` 方法后增加：

```typescript
isHealthy(): boolean {
  return this.writeEnabled && this.consecutiveFailures < this.maxConsecutiveFailures;
}
```

在 `insertRows` 的 catch 块中（`this.metrics.failures += 1;` 之后）增加：

```typescript
this.consecutiveFailures += 1;
if (this.consecutiveFailures === this.maxConsecutiveFailures) {
  console.warn(
    `[ClickHouse Writer] Marked unhealthy after ${this.maxConsecutiveFailures} consecutive failures. SQLite writes will resume as fallback.`,
  );
}
```

在 `insertRows` 成功路径（`this.metrics.trafficBatches += 1;` 之前）增加：

```typescript
if (this.consecutiveFailures > 0) {
  console.info('[ClickHouse Writer] Recovered from failure, marking healthy again.');
  this.consecutiveFailures = 0;
}
```

**Step 2：更新 `shouldSkipSqliteStatsWrites` 的参数语义**

`apps/collector/src/modules/stats/stats-write-mode.ts`：
- 将参数名 `clickHouseWriterEnabled` 改为 `clickHouseWriterHealthy`（语义更准确，实际行为不变）

**Step 3：更新 `batch-buffer.ts` 调用点**

`apps/collector/src/modules/collector/batch-buffer.ts`：

```typescript
// 旧：
const skipSqliteStatsWrites = shouldSkipSqliteStatsWrites(
  clickHouseWriter.isEnabled(),
);
// 改为：
const skipSqliteStatsWrites = shouldSkipSqliteStatsWrites(
  clickHouseWriter.isHealthy(),
);
```

```typescript
// 旧（第 139 行）：
const reduceSQLiteWrites = clickHouseWriter.isEnabled() && process.env.CH_DISABLE_SQLITE_REDUCTION !== '1';
// 改为：
const reduceSQLiteWrites = clickHouseWriter.isHealthy() && process.env.CH_DISABLE_SQLITE_REDUCTION !== '1';
```

（第 143、179 行的 `clickHouseWriter.isEnabled()` 用于判断是否发起 CH 写入，保持不变——我们仍尝试写入，失败会计入 consecutiveFailures。）

**Step 4：更新测试**

`apps/collector/src/modules/stats/stats-write-mode.test.ts` 中测试描述和变量名更新为使用 `healthy` 语义，测试用例本身 `true/false` 逻辑不变：

```typescript
it('should keep sqlite writes when CH_ONLY_MODE is disabled', async () => {
  const mode = await import('./stats-write-mode.js');
  expect(mode.shouldSkipSqliteStatsWrites(true)).toBe(false);   // healthy=true but mode off
  expect(mode.shouldSkipSqliteStatsWrites(false)).toBe(false);  // healthy=false and mode off
});
it('should keep sqlite writes and warn when writer is unhealthy', async () => {
  process.env.CH_ONLY_MODE = '1';
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const mode = await import('./stats-write-mode.js');
  expect(mode.shouldSkipSqliteStatsWrites(false)).toBe(false);  // healthy=false → keep sqlite
  expect(warn).toHaveBeenCalledTimes(1);
});
it('should skip sqlite writes when writer is healthy', async () => {
  process.env.CH_ONLY_MODE = '1';
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  const mode = await import('./stats-write-mode.js');
  expect(mode.shouldSkipSqliteStatsWrites(true)).toBe(true);   // healthy=true → skip sqlite
  expect(info).toHaveBeenCalledTimes(1);
});
```

**Step 5：运行测试**

```bash
pnpm --filter collector test -- --reporter=verbose
```

Expected: 所有 stats-write-mode 测试通过

**Step 6：TypeScript 检查**

```bash
pnpm --filter collector exec tsc --noEmit
```

Expected: 无错误

**Step 7：提交**

```bash
git add apps/collector/src/modules/clickhouse/clickhouse.writer.ts \
        apps/collector/src/modules/collector/batch-buffer.ts \
        apps/collector/src/modules/stats/stats-write-mode.ts \
        apps/collector/src/modules/stats/stats-write-mode.test.ts
git commit -m "fix(clickhouse): track runtime health in writer to prevent data loss when CH is down"
```

---

## Task 2：nekoagent stop 等待时间修复（P0-2）

**Files:**
- Modify: `apps/agent/nekoagent`

**背景：** agent 的优雅停机需要 10 秒，但 `nekoagent stop` 只等 1 秒就 SIGKILL，丢失最后一批数据。

**Step 1：定位并修改等待时间**

在 `apps/agent/nekoagent` 中找到 `cmd_stop()` 函数（约第 317-333 行）：

```sh
# 旧：
kill "$pid" >/dev/null 2>&1 || true
sleep 1
if kill -0 "$pid" >/dev/null 2>&1; then
  kill -9 "$pid" >/dev/null 2>&1 || true
fi

# 改为：
kill "$pid" >/dev/null 2>&1 || true
# Wait up to 12s for graceful shutdown (agent needs up to 10s for final flush)
i=0
while [ $i -lt 12 ] && kill -0 "$pid" >/dev/null 2>&1; do
  sleep 1
  i=$((i + 1))
done
if kill -0 "$pid" >/dev/null 2>&1; then
  kill -9 "$pid" >/dev/null 2>&1 || true
fi
```

**Step 2：手动验证（可选）**

```bash
# 启动一个测试实例后立即停止，确认 stop 等待行为
nekoagent status <instance_name>
time nekoagent stop <instance_name>
# Expected: 进程在 12 秒内自然退出，耗时 < 12 秒
```

**Step 3：提交**

```bash
git add apps/agent/nekoagent
git commit -m "fix(agent): extend stop grace period to 12s to allow final flush"
```

---

## Task 3：ClickHouseReader 改用 POST body 传 SQL（P1-1）

**Files:**
- Modify: `apps/collector/src/modules/clickhouse/clickhouse.reader.ts`

**背景：** 将 SQL 放 URL query 参数，长查询可能超过 URL 长度限制（8-16KB）。

**Step 1：修改 `query()` 方法**

找到 `clickhouse.reader.ts` 末尾的 `private async query<T>` 方法（约第 1193 行），修改 fetch 调用：

```typescript
// 旧：
const response = await fetch(
  `${baseUrl}/?database=${encodeURIComponent(this.config.database)}&query=${encodeURIComponent(`${query}\nFORMAT JSON`)}`,
  {
    method: 'POST',
    headers: {
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    signal: AbortSignal.timeout(this.config.timeoutMs),
  },
);

// 改为：
const response = await fetch(
  `${baseUrl}/?database=${encodeURIComponent(this.config.database)}`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: `${query}\nFORMAT JSON`,
    signal: AbortSignal.timeout(this.config.timeoutMs),
  },
);
```

**Step 2：TypeScript 检查**

```bash
pnpm --filter collector exec tsc --noEmit
```

**Step 3：提交**

```bash
git add apps/collector/src/modules/clickhouse/clickhouse.reader.ts
git commit -m "fix(clickhouse): send reader SQL via POST body instead of URL query param"
```

---

## Task 4：`toDateTime` 无效日期保护（P1-2）

**Files:**
- Modify: `apps/collector/src/modules/clickhouse/clickhouse.reader.ts`

**背景：** 无效日期时返回 epoch（1970-01-01），导致全表扫描。

**Step 1：修改 `toDateTime` 返回 null 并更新调用点**

将 `toDateTime` 方法修改为返回 `string | null`：

```typescript
private toDateTime(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 19).replace('T', ' ');
}
```

在所有使用 `this.toDateTime(start)` / `this.toDateTime(end)` 的查询方法顶部增加守卫：

```typescript
// 在每个使用 toDateTime 的 async 方法开头
const startDT = this.toDateTime(start);
const endDT = this.toDateTime(end);
if (!startDT || !endDT) return null;
// 然后在 SQL 中使用 startDT / endDT 代替内联调用
```

注意：`toDateTime` 在模板字符串中被内联调用（如 `toDateTime('${this.toDateTime(start)}')`），需要将这些改为先赋值再使用，避免出现 `'null'` 字符串进入 SQL。

**Step 2：TypeScript 检查**

```bash
pnpm --filter collector exec tsc --noEmit
```

**Step 3：提交**

```bash
git add apps/collector/src/modules/clickhouse/clickhouse.reader.ts
git commit -m "fix(clickhouse): guard against invalid dates in reader to prevent full table scans"
```

---

## Task 5：恢复路由指标日志输出（P1-3）

**Files:**
- Modify: `apps/collector/src/modules/stats/stats.service.ts`

**背景：** 路由统计数据被收集但 console.info 被注释掉，形成无意义的计算和运维盲点。

**Step 1：找到 `maybeLogRouteMetrics` 中被注释的日志行**

位置约 `stats.service.ts:137`：

```typescript
// 旧（被注释）：
// Stats route metrics logging removed

// 改为：
console.info(
  `[StatsService] Route metrics: ${parts} window_sec=${(elapsedMs / 1000).toFixed(1)}`,
);
```

完整的修复区域是在 `if (entries.length > 0)` 块内，变量 `parts` 已经在上方正确构建，只需恢复 `console.info` 调用。

**Step 2：TypeScript 检查**

```bash
pnpm --filter collector exec tsc --noEmit
```

**Step 3：提交**

```bash
git add apps/collector/src/modules/stats/stats.service.ts
git commit -m "fix(stats): restore route metrics logging for observability"
```

---

## Task 6：`syncPolicyState` 增加 MD5 去重（P1-4）

**Files:**
- Modify: `apps/agent/internal/agent/runner.go`

**背景：** 每 30 秒无条件 POST 策略状态，即使没有变化。

**Step 1：在 `Runner` struct 中增加 `lastPolicyHash` 字段**

```go
// 在 lastConfigHash string 下方增加：
lastPolicyHash string
```

**Step 2：修改 `syncPolicyState` 方法增加去重逻辑**

```go
func (r *Runner) syncPolicyState(ctx context.Context) error {
    snap, err := r.gatewayClient.GetPolicyStateSnapshot(ctx)
    if err != nil {
        return err
    }

    // Skip POST if policy state unchanged
    data, _ := json.Marshal(snap)
    hash := fmt.Sprintf("%x", md5.Sum(data))

    r.mu.Lock()
    unchanged := hash == r.lastPolicyHash
    r.mu.Unlock()

    if unchanged {
        return nil
    }

    snap.Timestamp = time.Now().UnixMilli()

    payload := policyStatePayload{
        BackendID:   r.cfg.BackendID,
        AgentID:     r.cfg.AgentID,
        PolicyState: snap,
    }

    if err := r.postJSON(ctx, "/agent/policy-state", payload); err != nil {
        return err
    }

    r.mu.Lock()
    r.lastPolicyHash = hash
    r.mu.Unlock()
    return nil
}
```

**Step 3：编译验证**

```bash
cd apps/agent && go build ./...
```

Expected: 无错误

**Step 4：提交**

```bash
git add apps/agent/internal/agent/runner.go
git commit -m "fix(agent): skip policy state sync POST when state is unchanged"
```

---

## Task 7：`install.sh` 参数拼接安全修复（P2-1）

**Files:**
- Modify: `apps/agent/install.sh`

**背景：** 第 332-333 行使用 `$()` 展开加参数，依赖 word splitting，存在空格安全隐患。

**Step 1：找到末尾的 `nekoagent add` 调用（约第 326-334 行）**

```sh
# 旧：
"$cli_target" add "$NEKO_INSTANCE_NAME" \
    --server-url "$NEKO_SERVER" \
    --backend-id "$NEKO_BACKEND_ID" \
    --backend-token "$NEKO_BACKEND_TOKEN" \
    --gateway-type "$NEKO_GATEWAY_TYPE" \
    --gateway-url "$NEKO_GATEWAY_URL" \
    $(if [ -n "$NEKO_GATEWAY_TOKEN" ]; then echo "--gateway-token $NEKO_GATEWAY_TOKEN"; fi) \
    $(if [ "$NEKO_AUTO_START" = "true" ]; then echo "--auto-start"; fi)

# 改为：
set -- \
    "$cli_target" add "$NEKO_INSTANCE_NAME" \
    --server-url "$NEKO_SERVER" \
    --backend-id "$NEKO_BACKEND_ID" \
    --backend-token "$NEKO_BACKEND_TOKEN" \
    --gateway-type "$NEKO_GATEWAY_TYPE" \
    --gateway-url "$NEKO_GATEWAY_URL"

if [ -n "$NEKO_GATEWAY_TOKEN" ]; then
    set -- "$@" --gateway-token "$NEKO_GATEWAY_TOKEN"
fi
if [ "$NEKO_AUTO_START" = "true" ]; then
    set -- "$@" --auto-start
fi

"$@"
```

**Step 2：同文件修复 `detect_existing_install` 重复调用（P2-2）**

```sh
# 旧（约第 195-198 行）：
existing_agent=""
if detect_existing_install; then
    existing_agent="$(detect_existing_install)"
fi

# 改为：
existing_agent=""
if existing_agent="$(detect_existing_install 2>/dev/null)"; then
    : # existing_agent 已赋值
fi
```

注意：`detect_existing_install` 成功时 echo 路径到 stdout 并 return 0；失败时 return 1。上述写法同时捕获输出和返回值。

**Step 3：手动验证语法**

```bash
sh -n apps/agent/install.sh
```

Expected: 无语法错误输出

**Step 4：提交**

```bash
git add apps/agent/install.sh
git commit -m "fix(agent): use set -- pattern for safe argument passing in install.sh"
```

---

## 最终验证

```bash
# TypeScript 完整检查
pnpm --filter collector exec tsc --noEmit

# 运行所有测试
pnpm --filter collector test

# Go 编译
cd apps/agent && go build ./...

# Shell 语法检查
sh -n apps/agent/install.sh
sh -n apps/agent/nekoagent
```

---

## 变更范围总结

| Task | 文件数 | 重要性 |
|---|---|---|
| Task 1: CH 运行时健康追踪 | 4 | P0 |
| Task 2: nekoagent stop 等待 | 1 | P0 |
| Task 3: Reader POST body | 1 | P1 |
| Task 4: toDateTime 保护 | 1 | P1 |
| Task 5: 路由指标日志 | 1 | P1 |
| Task 6: syncPolicyState 去重 | 1 | P1 |
| Task 7: install.sh 参数安全 | 1 | P2 |
