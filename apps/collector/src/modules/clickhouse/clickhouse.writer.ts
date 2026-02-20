import type { TrafficUpdate } from '../collector/batch-buffer.js';
import { loadClickHouseConfig } from './clickhouse.config.js';

interface CountryMinuteUpdate {
  country: string;
  countryName: string;
  continent: string;
  upload: number;
  download: number;
  timestampMs?: number;
}

export class ClickHouseWriter {
  private readonly config = loadClickHouseConfig();
  private readonly writeEnabled =
    this.config.enabled && process.env.CH_WRITE_ENABLED === '1';
  private readonly metricsIntervalMs = Math.max(
    1000,
    Number.parseInt(process.env.CH_METRICS_LOG_INTERVAL_MS || '60000', 10) || 60000,
  );
  private readonly maxPendingBatches = Math.max(
    10,
    Number.parseInt(process.env.CH_WRITE_MAX_PENDING_BATCHES || '200', 10) || 200,
  );
  private readonly maxPendingRows = Math.max(
    1000,
    Number.parseInt(process.env.CH_WRITE_MAX_PENDING_ROWS || '200000', 10) || 200000,
  );
  private writeChain: Promise<void> = Promise.resolve();
  private pendingBatches = 0;
  private pendingRows = 0;
  private metricsWindowStartedAt = Date.now();
  private metrics = {
    trafficBatches: 0,
    trafficRows: 0,
    countryBatches: 0,
    countryRows: 0,
    failures: 0,
  };

  isEnabled(): boolean {
    return this.writeEnabled;
  }

  writeTrafficBatch(backendId: number, updates: TrafficUpdate[]): void {
    if (!this.writeEnabled || updates.length === 0) return;

    const detailRows = updates.map((item) => ({
      backend_id: backendId,
      minute: this.toMinuteDateTime(item.timestampMs),
      domain: item.domain || '',
      ip: item.ip || '',
      source_ip: item.sourceIP || '',
      chain: item.chains.join(' > ') || item.chain || 'DIRECT',
      rule:
        item.chains.length > 1
          ? item.chains[item.chains.length - 1]
          : item.rulePayload
            ? `${item.rule}(${item.rulePayload})`
            : item.rule,
      upload: Math.max(0, Math.floor(item.upload)),
      download: Math.max(0, Math.floor(item.download)),
      connections: 1,
    }));

    // Pre-aggregate by (backend_id, minute) for the lightweight agg table
    const aggMap = new Map<string, { backend_id: number; minute: string; upload: number; download: number; connections: number }>();
    for (const row of detailRows) {
      const key = `${row.backend_id}:${row.minute}`;
      const existing = aggMap.get(key);
      if (existing) {
        existing.upload += row.upload;
        existing.download += row.download;
        existing.connections += row.connections;
      } else {
        aggMap.set(key, { backend_id: row.backend_id, minute: row.minute, upload: row.upload, download: row.download, connections: row.connections });
      }
    }
    const aggRows = Array.from(aggMap.values());

    // Write to buffer tables — data goes to memory first, auto-flushed to disk every ~60s
    this.enqueue(() => this.insertRows('traffic_detail_buffer', detailRows, 'traffic'), detailRows.length);
    this.enqueue(() => this.insertRows('traffic_agg_buffer', aggRows, 'traffic'), aggRows.length);
  }

  writeCountryBatch(backendId: number, updates: CountryMinuteUpdate[]): void {
    if (!this.writeEnabled || updates.length === 0) return;

    const rows = updates.map((item) => ({
      backend_id: backendId,
      minute: this.toMinuteDateTime(item.timestampMs),
      country: item.country || '',
      country_name: item.countryName || '',
      continent: item.continent || '',
      upload: Math.max(0, Math.floor(item.upload)),
      download: Math.max(0, Math.floor(item.download)),
      connections: 1,
    }));

    this.enqueue(() => this.insertRows('country_buffer', rows, 'country'), rows.length);
  }

  private enqueue(task: () => Promise<void>, rowCount: number): void {
    const safeRowCount = Math.max(0, rowCount);
    if (
      this.pendingBatches >= this.maxPendingBatches ||
      this.pendingRows + safeRowCount > this.maxPendingRows
    ) {
      this.metrics.failures += 1;
      this.maybeLogMetrics();
      console.warn(
        `[ClickHouse Writer] Dropped batch because pending queue is full (batches=${this.pendingBatches}/${this.maxPendingBatches}, rows=${this.pendingRows}/${this.maxPendingRows})`,
      );
      return;
    }

    this.pendingBatches += 1;
    this.pendingRows += safeRowCount;
    this.writeChain = this.writeChain
      .then(() => task())
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[ClickHouse Writer] Queue task failed: ${message}`);
      })
      .finally(() => {
        this.pendingBatches = Math.max(0, this.pendingBatches - 1);
        this.pendingRows = Math.max(0, this.pendingRows - safeRowCount);
      });
  }

  private async insertRows(
    table: 'traffic_agg_buffer' | 'traffic_detail_buffer' | 'country_buffer' | 'traffic_minute' | 'traffic_agg' | 'traffic_detail' | 'country_minute',
    rows: Array<Record<string, unknown>>,
    metricType: 'traffic' | 'country',
  ): Promise<void> {
    const authHeader =
      this.config.password.length > 0
        ? `Basic ${Buffer.from(`${this.config.user}:${this.config.password}`).toString('base64')}`
        : '';
    const body = rows.map((row) => JSON.stringify(row)).join('\n');
    const url = `${this.config.protocol}://${this.config.host}:${this.config.port}/?database=${encodeURIComponent(this.config.database)}&query=${encodeURIComponent(`INSERT INTO ${this.config.database}.${table} FORMAT JSONEachRow`)}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body,
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`status=${response.status} body=${text.slice(0, 200)}`);
      }

      if (metricType === 'traffic') {
        this.metrics.trafficBatches += 1;
        this.metrics.trafficRows += rows.length;
      } else {
        this.metrics.countryBatches += 1;
        this.metrics.countryRows += rows.length;
      }
      this.maybeLogMetrics();
    } catch (error) {
      this.metrics.failures += 1;
      this.maybeLogMetrics();
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[ClickHouse Writer] Failed to insert ${metricType} batch rows=${rows.length}: ${message}`);
    }
  }

  private toMinuteDateTime(timestampMs?: number): string {
    const date = new Date(timestampMs ?? Date.now()).toISOString();
    return `${date.slice(0, 16).replace('T', ' ')}:00`;
  }

  private maybeLogMetrics(): void {
    const now = Date.now();
    const elapsedMs = now - this.metricsWindowStartedAt;
    if (elapsedMs < this.metricsIntervalMs) {
      return;
    }

    const elapsedSec = Math.max(1, elapsedMs / 1000);
    console.info(
      `[ClickHouse Writer] traffic_batches=${this.metrics.trafficBatches} traffic_rows=${this.metrics.trafficRows} country_batches=${this.metrics.countryBatches} country_rows=${this.metrics.countryRows} failures=${this.metrics.failures} pending_batches=${this.pendingBatches} pending_rows=${this.pendingRows} rows_per_sec=${((this.metrics.trafficRows + this.metrics.countryRows) / elapsedSec).toFixed(1)} window_sec=${elapsedSec.toFixed(1)}`,
    );

    this.metricsWindowStartedAt = now;
    this.metrics = {
      trafficBatches: 0,
      trafficRows: 0,
      countryBatches: 0,
      countryRows: 0,
      failures: 0,
    };
  }
}

let writer: ClickHouseWriter | null = null;

export function getClickHouseWriter(): ClickHouseWriter {
  if (!writer) {
    writer = new ClickHouseWriter();
  }
  return writer;
}
