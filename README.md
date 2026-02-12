<p align="center">
  <img src="./assets/icon-neko-master.png" width="200" alt="Neko Master Logo" style="margin-bottom: 16px;">
  <br>
  <b style="font-size: 32px;">Neko Master</b>
</p>

<p align="center">
  <b>让你的网络流量一目了然。</b><br>
  <span>实时监控 · 流量审计 · 多网关管理</span>
</p>

<p align="center">
   <b>中文 | <a href="./README.en.md">English</a></b>
</p>

<p align="center">
  <a href="https://github.com/foru17/neko-master/stargazers"><img src="https://img.shields.io/github/stars/foru17/neko-master?style=flat-square&color=yellow" alt="Stars"></a>
  <a href="https://hub.docker.com/r/foru17/neko-master"><img src="https://img.shields.io/docker/pulls/foru17/neko-master?style=flat-square&color=blue&logo=docker" alt="Docker Pulls"></a>
  <a href="https://hub.docker.com/r/foru17/neko-master"><img src="https://img.shields.io/docker/v/foru17/neko-master?style=flat-square&label=Docker&color=2496ED" alt="Docker Version"></a>
  <a href="https://github.com/foru17/neko-master/blob/main/LICENSE"><img src="https://img.shields.io/github/license/foru17/neko-master?style=flat-square&color=green" alt="License"></a>
  <img src="https://img.shields.io/badge/Node.js-22-339933?style=flat-square&logo=node.js">
</p>

> [!IMPORTANT]
> **免责声明**
>
> 本项目为 **网络流量分析与可视化工具**，
> 用于展示与统计本地网关的流量数据。
>
> 本项目 **不提供任何网络接入服务、代理订阅或跨网络连接功能**。
> 所有数据均来源于用户自有网络环境。
>
> 本项目遵循 MIT 协议开源，不对因使用本软件产生的任何后果承担责任。请在合规范围内使用。

![Neko Master Overview](./assets/neko-master-overview.png)
![Neko Master Rules](./assets/neko-master-rules.png)
![Neko Master Regions](./assets/neko-master-regions.png)

## 🌐 在线演示

**演示地址**: https://neko-master.is26.com  
**访问密码**: `neko2026`

> 演示站为只读展示模式，部分功能受限。

## 关于名称

**Neko**（ねこ）在日语中意为“猫”，
发音为 **/ˈneɪkoʊ/**（NEH-ko）。

如同猫一般安静而敏锐，
Neko Master 专注于对网络流量进行轻量、精确的分析与可视化。

## 📋 目录

- [🚀 快速开始](#-快速开始)
- [📖 首次使用](#-首次使用)
- [🔧 端口冲突解决](#-端口冲突解决)
- [🐳 Docker 配置](#-docker-配置)
- [🌐 反向代理与 Tunnel](#-反向代理与-tunnel)
- [❓ 常见问题](#-常见问题)
- [📁 项目结构](#-项目结构)
- [🛠️ 技术栈](#️-技术栈)
- [📝 更新日志](./CHANGELOG.md)
- [📄 许可证](#-许可证)

## 🚀 快速开始

### 方式一：Docker Compose（推荐）

#### 场景 A：最简部署（仅暴露 3000）

```yaml
services:
  neko-master:
    image: foru17/neko-master:latest
    container_name: neko-master
    restart: unless-stopped
    ports:
      - "3000:3000" # Web UI
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - DB_PATH=/app/data/stats.db
```

> 该模式完全兼容升级，页面可用。  
> 未打通 WS 时会自动回退到 HTTP 轮询刷新。

#### 场景 B：实时 WebSocket（推荐，配合反向代理）

```yaml
services:
  neko-master:
    image: foru17/neko-master:latest
    container_name: neko-master
    restart: unless-stopped
    ports:
      - "3000:3000" # Web UI
      - "3002:3002" # WebSocket（供 Nginx / Tunnel 转发）
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - DB_PATH=/app/data/stats.db
```

启动服务：

```bash
docker compose up -d
```

访问 <http://localhost:3000>

### 方式二：Docker 直接运行

```bash
# 最简（仅 3000）
docker run -d \
  --name neko-master \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  --restart unless-stopped \
  foru17/neko-master:latest

# 实时 WS（配合反代）
docker run -d \
  --name neko-master \
  -p 3000:3000 \
  -p 3002:3002 \
  -v $(pwd)/data:/app/data \
  --restart unless-stopped \
  foru17/neko-master:latest
```

> 默认前端 API 走同域 `/api`，通常不需要额外暴露 3001。  
> 若希望 WebSocket 实时生效，需要让反代层可以访问 `3002`；未打通时会回退到 HTTP 轮询（约 5 秒级）。

访问 <http://localhost:3000>

> 如需自定义外部端口（docker run），请额外传入：
> `-e WEB_EXTERNAL_PORT=8080 -e API_EXTERNAL_PORT=8081 -e WS_EXTERNAL_PORT=8082`

### 方式三：一键脚本

自动检测端口冲突并配置，适合不熟悉 Docker 的用户：

```bash
# 使用 curl
curl -fsSL https://raw.githubusercontent.com/foru17/neko-master/main/setup.sh | bash

# 或使用 wget
wget -qO- https://raw.githubusercontent.com/foru17/neko-master/main/setup.sh | bash
```

脚本会自动：

- ✅ 下载 `docker-compose.yml`
- ✅ 检测默认端口（3000/3001/3002）是否被占用
- ✅ 提供可用的替代端口
- ✅ 创建配置文件并启动服务

### 方式四：源码运行

```bash
# 1. 克隆仓库
git clone https://github.com/foru17/neko-master.git
cd neko-master

# 2. 安装依赖
pnpm install

# 3. 启动开发服务
pnpm dev
```

访问 <http://localhost:3000>

## 📖 首次使用

![首次使用](./assets/neko-master-setup.png)

1. 打开 <http://localhost:3000>
2. 首次访问会弹出**网关配置**对话框
3. 填写网络网关（如 OpenClash）连接信息：
   - **名称**: 自定义名称（如 "Home Gateway"）
   - **地址**: 网关后端地址（如 `192.168.101.1`）
   - **端口**: 网关后端端口（如 `9090`）
   - **Token**: 如果配置了 Secret 则填写，否则留空
4. 点击「添加后端」保存配置
5. 系统将自动开始采集并分析流量数据

> 💡 **获取网关地址**: 进入网关控制面板（如 OpenClash） → 打开「外部控制」→ 复制 API 地址

## 🔧 端口冲突解决

如果看到错误提示端口已被占用，有以下几种解决方案：

### 方案 1：使用 .env 文件

创建 `.env` 文件（与 `docker-compose.yml` 同目录）：

```env
WEB_EXTERNAL_PORT=8080    # 修改 Web UI 端口
API_EXTERNAL_PORT=8081    # 修改 API 端口
WS_EXTERNAL_PORT=8082     # 修改 WebSocket 外部端口（仅直连时需要）
```

然后重启：

```bash
docker compose down
docker compose up -d
```

现在访问 <http://localhost:8080>

### 方案 2：直接修改 docker-compose.yml

```yaml
ports:
  - "8080:3000" # 外部 8080 → 内部 3000
  - "8082:3002" # 外部 8082 → 内部 3002（给反代/Tunnel 转发 WS）
```

> 说明：前端会在运行时读取外部端口配置，无需再设置 `NEXT_PUBLIC_WS_PORT`。

### 方案 3：使用一键脚本

```bash
curl -fsSL https://raw.githubusercontent.com/foru17/neko-master/main/setup.sh | bash
```

脚本会自动检测并提供可用的端口。

## 🐳 Docker 配置

### 端口说明

| 端口 |   用途    | 外部必需 | 说明                                             |
| :--: | :-------: | :------: | :----------------------------------------------- |
| 3000 | Web 界面  |    ✅    | 前端访问入口                                     |
| 3001 | API 接口  |   可选   | 前端默认同域 `/api`，一般无需暴露                |
| 3002 | WebSocket |   可选   | 实时推送端口，建议仅给反代层转发，不直接公网暴露 |

### 环境变量说明（Docker）

| 变量名                | 默认值               | 作用                                       | 何时设置                  |
| :-------------------- | :------------------- | :----------------------------------------- | :------------------------ |
| `WEB_PORT`            | `3000`               | 前端服务监听端口（容器内）                 | 一般不用改                |
| `API_PORT`            | `3001`               | API 服务监听端口（容器内）                 | 一般不用改                |
| `COLLECTOR_WS_PORT`   | `3002`               | WS 服务监听端口（容器内）                  | 一般不用改                |
| `DB_PATH`             | `/app/data/stats.db` | SQLite 数据文件路径                        | 自定义数据目录时          |
| `WEB_EXTERNAL_PORT`   | `3000`               | 运行时注入给前端显示/拼接用的外部 Web 端口 | 外部映射端口变更时        |
| `API_EXTERNAL_PORT`   | `3001`               | 运行时注入给前端的 API 外部端口            | 仅直连 API 时             |
| `WS_EXTERNAL_PORT`    | `3002`               | 运行时注入给前端的 WS 外部端口             | 仅直连 WS 时              |
| `NEXT_PUBLIC_API_URL` | 空                   | 强制前端 API 基地址（覆盖默认 `/api`）     | API 不走同域时            |
| `NEXT_PUBLIC_WS_URL`  | 自动 `/_cm_ws`       | 自定义前端 WS 地址（覆盖默认）             | 仅在你想改默认路径/域名时 |

### API / WS 地址解析优先级

1. API：`runtime-config(API_URL)` → `NEXT_PUBLIC_API_URL` → 默认同域 `/api`
2. WS：`runtime-config(WS_URL)` → `NEXT_PUBLIC_WS_URL` → 自动推断
3. 默认即使用同域 `/_cm_ws`，无需手动配置；仅在自定义路由时再设置 `NEXT_PUBLIC_WS_URL`

## 🌐 反向代理与 Tunnel

推荐将 Web 页面与 WS 都放在同一个域名下，通过不同路径转发：`/` → `3000`，`/_cm_ws` → `3002`。

### Nginx 标准示例（推荐）

```nginx
server {
  listen 443 ssl http2;
  server_name neko.example.com;

  location / {
    proxy_pass http://<neko-master-host>:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location ^~ /_cm_ws {
    proxy_pass http://<neko-master-host>:3002;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400;
    proxy_send_timeout 86400;
    proxy_buffering off;
  }
}
```

配套 Docker 环境变量：

```env
# 默认无需配置（已默认 /_cm_ws）
# 如需自定义可设置：
# NEXT_PUBLIC_WS_URL=/custom_ws
```

### Cloudflare Tunnel 标准示例

`~/.cloudflared/config.yml`：

```yaml
tunnel: <your-tunnel-name-or-id>
credentials-file: /path/to/<credentials>.json

ingress:
  - hostname: neko.example.com
    path: /_cm_ws*
    service: http://localhost:3002
  - hostname: neko.example.com
    path: /*
    service: http://localhost:3000
  - service: http_status:404
```

启动：

```bash
cloudflared tunnel --config ~/.cloudflared/config.yml run <your-tunnel-name-or-id>
```

如果使用 Zero Trust Dashboard 托管路由（token 方式），请在 Dashboard 中配置同样两条规则，并保证 `/_cm_ws*` 在 `/*` 之前。

### 关键注意事项

1. 不要把 WS 路径写成 `ws`（无前导 `/`），容易误匹配静态资源，导致 `/_next/static/...` 返回 `426 Upgrade Required`
2. WS 路由必须高于 catch-all 路由（`/*`）
3. 默认不需要配置 `NEXT_PUBLIC_WS_URL`；如你自定义了该变量，修改后需重启前端进程/容器
4. 容器仅映射 `3000` 也能正常用，但会自动回退到 HTTP 轮询（约 5 秒级），实时性弱于 WS
5. `beacon.min.js` 等第三方脚本失败通常不影响主数据链路（API/WS）
6. 默认不需要单独配置 `/api` 反代：前端会同域访问 `/api` 并由应用内部转发到 `3001`

### 多架构支持

Docker 镜像同时支持 `linux/amd64` 和 `linux/arm64`。

### 数据持久化

数据默认存储在容器内的 `/app/data` 目录，建议映射到宿主机：

```yaml
volumes:
  - ./data:/app/data
```

### 更新到最新版本

```bash
# 拉取最新镜像并重新启动
docker compose pull
docker compose up -d
```

## 🔐 认证与安全

Neko Master 支持访问鉴权功能，保护你的面板数据安全。

### 开启/关闭鉴权

1. 进入面板，点击左侧边栏底部的「设置」。
2. 切换到「安全」标签页。
3. 在此页面可以开启/关闭访问控制，并设置访问令牌（Token）。

### 忘记密码（重置访问令牌）

如果你忘记了访问令牌，可以通过环境变量 `FORCE_ACCESS_CONTROL_OFF` 强制进入**紧急访问模式**。

#### Docker Compose 用户

1. 修改 `docker-compose.yml`，在 `environment` 下添加：

   ```yaml
   environment:
     - FORCE_ACCESS_CONTROL_OFF=true
   ```

2. 重启容器：

   ```bash
   docker compose up -d
   ```

3. 刷新页面，你将看到“紧急访问模式”警告。此时无需旧密码即可在「设置 -> 安全」中重置新令牌。

4. **重要**：重置完成后，务必删除该环境变量并再次重启容器，以恢复访问控制。

#### Docker 命令行用户

1. 停止并删除旧容器（数据在挂载卷中，不会丢失）：

   ```bash
   docker stop neko-master
   docker rm neko-master
   ```

2. 添加 `-e FORCE_ACCESS_CONTROL_OFF=true` 参数重新启动：

   ```bash
   docker run -d \
     --name neko-master \
     -p 3000:3000 \
     -v $(pwd)/data:/app/data \
     -e FORCE_ACCESS_CONTROL_OFF=true \
     foru17/neko-master:latest
   ```

3. 重置密码后，再次停止容器，去除该参数并重启，恢复正常保护模式。

## ❓ 常见问题

### Q: 提示 "端口已被占用" 怎么办？

**A:** 参考上方[端口冲突解决](#-端口冲突解决)部分。最简单的方式是创建 `.env` 文件修改端口。

### Q: 修改端口后无法访问？

**A:** 确保三点：

1. `.env` 文件中的端口已修改
2. 重启了服务：`docker compose restart`
3. 访问时使用了新端口（如 `http://localhost:8080`）

### Q: 从旧版升级到 WebSocket 版，只映射 `3000:3000` 会不兼容吗？

**A:** 不会。页面功能仍可用，未打通 WS 时会自动回退为 HTTP 轮询。  
如需完整实时能力，请按上文配置反代路径（如 `/_cm_ws`）并将其转发到 `3002`。

### Q: 如果没有配置 WS 的外部转发，会影响使用吗？

**A:** 不影响核心功能和数据展示。系统会自动回退到 HTTP 轮询刷新。  
差异主要是实时体验：WS 模式更即时；未打通 WS 时刷新频率约为 5 秒级。

### Q: 为什么会出现 `/_next/static/... 426 Upgrade Required`？

**A:** 通常是 WS 路由匹配过宽，把静态资源误转发到 WS 端口了。请检查：

1. Cloudflare Tunnel / Nginx 的 WS 路径不要写成 `ws`，应使用 `/_cm_ws*`
2. WS 路由优先级必须高于 `/*`
3. 若你手动设置了 `NEXT_PUBLIC_WS_URL`，需确保与反代路径一致（例如都为 `/_cm_ws`）

### Q: 连接 OpenClash 失败？

**A:** 检查以下几点：

1. OpenClash 的「外部控制」是否已开启
2. OpenClash 地址是否正确（格式：`IP:端口`）
3. 如果配置了 Secret，Token 是否填写正确
4. 容器是否能访问到 OpenClash 所在网络

### Q: 如何查看服务日志？

**A:**

```bash
# 查看所有日志
docker logs -f neko-master

# 只看最后 100 行
docker logs --tail 100 neko-master
```

### Q: 如何备份数据？

**A:** 数据存储在映射的目录中（默认 `./data/stats.db`）：

```bash
cp -r ./data ./data-backup-$(date +%Y%m%d)
```

### Q: 如何清理历史数据？

**A:**

1. 点击左侧边栏底部的「设置」
2. 切换到「数据库」标签页
3. 选择清理范围：1天前 / 7天前 / 30天前 / 全部

## 📁 项目结构

```
neko-master/
├── docker-compose.yml      # Docker Compose 配置
├── Dockerfile              # Docker 镜像构建
├── setup.sh                # 一键配置脚本
├── docker-start.sh         # Docker 容器启动脚本
├── start.sh                # 源码开发启动脚本
├── assets/                 # 预览图和图标
├── apps/
│   ├── collector/          # 数据收集服务（Node.js + WebSocket）
│   └── web/                # Next.js 前端应用
└── packages/
    └── shared/             # 共享类型定义和工具
```

## 🛠️ 技术栈

- **前端**: Next.js 16 + React 19 + TypeScript + Tailwind CSS
- **UI 组件**: shadcn/ui
- **数据收集**: Node.js + Fastify + WebSocket + SQLite
- **可视化**: Recharts + D3.js
- **国际化**: next-intl（中/英）
- **部署**: Docker + Docker Compose

## 📄 许可证

MIT License © 2024 [foru17](https://github.com/foru17)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=foru17/neko-master&type=date&legend=top-left)](https://www.star-history.com/#foru17/neko-master&type=date&legend=top-left)

---

<p align="center">
  如果这个项目对你有帮助，请给个 ⭐ Star 支持一下！
</p>
