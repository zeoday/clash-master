import type { TrafficUpdate } from './batch-buffer.js';
import { loadClickHouseConfig } from './clickhouse.js';

interface CountryMinuteUpdate {
  country: string;
  countryName: string;
  continent: string;
  upload: number;
  download: number;
  timestampMs?: number;
}

class ClickHouseWriter {
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
  private writeChain: Promise<void> = Promise.resolve();
  private pendingBatches = 0;
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

    const rows = updates.map((item) => ({
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

    this.enqueue(() => this.insertRows('traffic_minute', rows, 'traffic'));
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

    this.enqueue(() => this.insertRows('country_minute', rows, 'country'));
  }

  private enqueue(task: () => Promise<void>): void {
    if (this.pendingBatches >= this.maxPendingBatches) {
      this.metrics.failures += 1;
      this.maybeLogMetrics();
      console.warn(
        `[ClickHouse Writer] Dropped batch because pending queue is full (${this.pendingBatches}/${this.maxPendingBatches})`,
      );
      return;
    }

    this.pendingBatches += 1;
    this.writeChain = this.writeChain
      .then(() => task())
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[ClickHouse Writer] Queue task failed: ${message}`);
      })
      .finally(() => {
        this.pendingBatches = Math.max(0, this.pendingBatches - 1);
      });
  }

  private async insertRows(
    table: 'traffic_minute' | 'country_minute',
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
      `[ClickHouse Writer] traffic_batches=${this.metrics.trafficBatches} traffic_rows=${this.metrics.trafficRows} country_batches=${this.metrics.countryBatches} country_rows=${this.metrics.countryRows} failures=${this.metrics.failures} pending_batches=${this.pendingBatches} rows_per_sec=${((this.metrics.trafficRows + this.metrics.countryRows) / elapsedSec).toFixed(1)} window_sec=${elapsedSec.toFixed(1)}`,
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

const writer = new ClickHouseWriter();

export function getClickHouseWriter(): ClickHouseWriter {
  return writer;
}
