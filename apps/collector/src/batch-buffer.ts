/**
 * Shared Batch Buffer
 *
 * Extracts the common BatchBuffer class, TrafficUpdate / GeoIPResult interfaces,
 * and toMinuteKey helper used by both collector.ts and surge-collector.ts.
 */
import type { StatsDatabase } from "./db.js";
import type { GeoIPService } from "./geo-service.js";
import { getClickHouseWriter } from "./clickhouse-writer.js";
import { shouldSkipSqliteStatsWrites } from "./stats-write-mode.js";

export interface TrafficUpdate {
  domain: string;
  ip: string;
  chain: string;
  chains: string[];
  rule: string;
  rulePayload: string;
  upload: number;
  download: number;
  sourceIP?: string;
  timestampMs?: number;
}

export interface GeoIPResult {
  ip: string;
  geo: {
    country: string;
    country_name: string;
    continent: string;
  } | null;
  upload: number;
  download: number;
  timestampMs?: number;
}

export function toMinuteKey(timestampMs?: number): string {
  const date = new Date(timestampMs ?? Date.now()).toISOString();
  return `${date.slice(0, 16)}:00`;
}

export interface FlushResult {
  domains: number;
  rules: number;
  trafficOk: boolean;
  countryOk: boolean;
  hasUpdates: boolean;
}

export class BatchBuffer {
  private buffer: Map<string, TrafficUpdate> = new Map();
  private geoQueue: GeoIPResult[] = [];
  private lastLogTime = 0;
  private logCounter = 0;

  add(backendId: number, update: TrafficUpdate) {
    const minuteKey = toMinuteKey(update.timestampMs);
    const fullChain = update.chains.join(" > ");
    const key = [
      backendId,
      minuteKey,
      update.domain,
      update.ip,
      update.chain,
      fullChain,
      update.rule,
      update.rulePayload,
      update.sourceIP || "",
    ].join(":");
    const existing = this.buffer.get(key);

    if (existing) {
      existing.upload += update.upload;
      existing.download += update.download;
      if ((update.timestampMs ?? 0) > (existing.timestampMs ?? 0)) {
        existing.timestampMs = update.timestampMs;
      }
    } else {
      this.buffer.set(key, { ...update });
    }
  }

  addGeoResult(result: GeoIPResult) {
    this.geoQueue.push(result);
  }

  size(): number {
    return this.buffer.size;
  }

  hasPending(): boolean {
    return this.buffer.size > 0 || this.geoQueue.length > 0;
  }

  flush(
    db: StatsDatabase,
    _geoService: GeoIPService | undefined,
    backendId: number,
    logPrefix = "Collector",
  ): FlushResult {
    const clickHouseWriter = getClickHouseWriter();
    const skipSqliteStatsWrites = shouldSkipSqliteStatsWrites(
      clickHouseWriter.isEnabled(),
    );
    const updates = Array.from(this.buffer.values());
    const geoResults = [...this.geoQueue];

    // Calculate unique domains and rules for logging
    const domains = new Set<string>();
    const rules = new Set<string>();

    for (const update of updates) {
      if (update.domain) domains.add(update.domain);
      const initialRule =
        update.chains.length > 0
          ? update.chains[update.chains.length - 1]
          : "DIRECT";
      rules.add(initialRule);
    }

    let trafficOk = true;
    let countryOk = true;

    if (updates.length > 0) {
      try {
        const reduceSQLiteWrites = clickHouseWriter.isEnabled() && process.env.CH_DISABLE_SQLITE_REDUCTION !== '1';
        if (!skipSqliteStatsWrites) {
          db.batchUpdateTrafficStats(backendId, updates, reduceSQLiteWrites);
        }
        if (clickHouseWriter.isEnabled()) {
          clickHouseWriter.writeTrafficBatch(backendId, updates);
        }
      } catch (err) {
        trafficOk = false;
        console.error(`[${logPrefix}:${backendId}] Batch write failed:`, err);
      }
    }

    if (trafficOk) {
      this.buffer.clear();
    }

    if (geoResults.length > 0) {
      try {
        const countryUpdates = geoResults
          .filter(
            (r): r is GeoIPResult & { geo: NonNullable<GeoIPResult["geo"]> } =>
              r.geo !== null,
          )
          .map((r) => ({
            country: r.geo.country,
            countryName: r.geo.country_name,
            continent: r.geo.continent,
            upload: r.upload,
            download: r.download,
            timestampMs: r.timestampMs,
          }));
        if (!skipSqliteStatsWrites) {
          db.batchUpdateCountryStats(backendId, countryUpdates);
        }
        if (clickHouseWriter.isEnabled()) {
          clickHouseWriter.writeCountryBatch(backendId, countryUpdates);
        }
      } catch (err) {
        countryOk = false;
        console.error(
          `[${logPrefix}:${backendId}] Country batch write failed:`,
          err,
        );
      }
    }

    if (countryOk) {
      this.geoQueue = [];
    }

    return {
      domains: domains.size,
      rules: rules.size,
      trafficOk,
      countryOk,
      hasUpdates: updates.length > 0 || geoResults.length > 0,
    };
  }

  shouldLog(): boolean {
    const now = Date.now();
    if (now - this.lastLogTime > 10000) {
      this.lastLogTime = now;
      return true;
    }
    return false;
  }

  incrementLogCounter(): number {
    return ++this.logCounter;
  }
}
