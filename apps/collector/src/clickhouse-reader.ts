import type { DomainStats, HourlyStats, IPStats } from '@neko-master/shared';
import { loadClickHouseConfig } from './clickhouse.js';

type StatsQuerySource = 'sqlite' | 'clickhouse' | 'auto';

export type ClickHouseSummary = {
  totalConnections: number;
  totalUpload: number;
  totalDownload: number;
  uniqueDomains: number;
  uniqueIPs: number;
};

export class ClickHouseReader {
  private readonly config = loadClickHouseConfig();
  private readonly source = this.parseSource(process.env.STATS_QUERY_SOURCE);

  shouldUseForRange(start?: string, end?: string): boolean {
    if (!this.config.enabled) return false;
    if (this.source === 'sqlite') return false;
    if (!start || !end) return false;
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    return Number.isFinite(startMs) && Number.isFinite(endMs) && startMs <= endMs;
  }

  async getSummary(
    backendId: number,
    start: string,
    end: string,
  ): Promise<ClickHouseSummary | null> {
    const rows = await this.query<ClickHouseSummary>(`
SELECT
  toUInt64(COALESCE(SUM(connections), 0)) AS totalConnections,
  toUInt64(COALESCE(SUM(upload), 0)) AS totalUpload,
  toUInt64(COALESCE(SUM(download), 0)) AS totalDownload,
  toUInt64(uniqExactIf(domain, domain != '')) AS uniqueDomains,
  toUInt64(uniqExactIf(ip, ip != '')) AS uniqueIPs
FROM ${this.config.database}.traffic_minute
WHERE backend_id = ${backendId}
  AND minute >= toDateTime('${this.toDateTime(start)}')
  AND minute <= toDateTime('${this.toDateTime(end)}')
`);
    return rows?.[0] || null;
  }

  async getTopDomainsLight(
    backendId: number,
    limit: number,
    start: string,
    end: string,
  ): Promise<DomainStats[] | null> {
    const rows = await this.query<Record<string, unknown>>(`
SELECT
  domain,
  toUInt64(SUM(upload)) AS totalUpload,
  toUInt64(SUM(download)) AS totalDownload,
  toUInt64(SUM(connections)) AS totalConnections,
  toString(max(minute)) AS lastSeen
FROM ${this.config.database}.traffic_minute
WHERE backend_id = ${backendId}
  AND minute >= toDateTime('${this.toDateTime(start)}')
  AND minute <= toDateTime('${this.toDateTime(end)}')
  AND domain != ''
GROUP BY domain
ORDER BY (SUM(upload) + SUM(download)) DESC
LIMIT ${Math.max(1, limit)}
`);
    if (!rows) return null;
    return (rows as Array<any>).map((row) => ({
      domain: String(row.domain || ''),
      totalUpload: Number(row.totalUpload || 0),
      totalDownload: Number(row.totalDownload || 0),
      totalConnections: Number(row.totalConnections || 0),
      lastSeen: String(row.lastSeen || ''),
      ips: [],
      rules: [],
      chains: [],
    }));
  }

  async getTopIPsLight(
    backendId: number,
    limit: number,
    start: string,
    end: string,
  ): Promise<IPStats[] | null> {
    const rows = await this.query<Record<string, unknown>>(`
SELECT
  ip,
  toUInt64(SUM(upload)) AS totalUpload,
  toUInt64(SUM(download)) AS totalDownload,
  toUInt64(SUM(connections)) AS totalConnections,
  toString(max(minute)) AS lastSeen
FROM ${this.config.database}.traffic_minute
WHERE backend_id = ${backendId}
  AND minute >= toDateTime('${this.toDateTime(start)}')
  AND minute <= toDateTime('${this.toDateTime(end)}')
  AND ip != ''
GROUP BY ip
ORDER BY (SUM(upload) + SUM(download)) DESC
LIMIT ${Math.max(1, limit)}
`);
    if (!rows) return null;
    return (rows as Array<any>).map((row) => ({
      ip: String(row.ip || ''),
      totalUpload: Number(row.totalUpload || 0),
      totalDownload: Number(row.totalDownload || 0),
      totalConnections: Number(row.totalConnections || 0),
      lastSeen: String(row.lastSeen || ''),
      domains: [],
      chains: [],
    }));
  }

  async getHourlyStats(
    backendId: number,
    hours: number,
    start: string,
    end: string,
  ): Promise<HourlyStats[] | null> {
    const rows = await this.query<Record<string, unknown>>(`
SELECT
  toString(toStartOfHour(minute)) AS hour,
  toUInt64(SUM(upload)) AS upload,
  toUInt64(SUM(download)) AS download,
  toUInt64(SUM(connections)) AS connections
FROM ${this.config.database}.traffic_minute
WHERE backend_id = ${backendId}
  AND minute >= toDateTime('${this.toDateTime(start)}')
  AND minute <= toDateTime('${this.toDateTime(end)}')
GROUP BY hour
ORDER BY hour DESC
LIMIT ${Math.max(1, hours)}
`);
    if (!rows) return null;
    return (rows as Array<any>).map((row) => ({
      hour: String(row.hour || ''),
      upload: Number(row.upload || 0),
      download: Number(row.download || 0),
      connections: Number(row.connections || 0),
    }));
  }

  async getCountryStats(
    backendId: number,
    limit: number,
    start: string,
    end: string,
  ): Promise<
    Array<{
      country: string;
      countryName: string;
      continent: string;
      totalUpload: number;
      totalDownload: number;
      totalConnections: number;
    }> | null
  > {
    const rows = await this.query<Record<string, unknown>>(`
SELECT
  country,
  any(country_name) AS countryName,
  any(continent) AS continent,
  toUInt64(SUM(upload)) AS totalUpload,
  toUInt64(SUM(download)) AS totalDownload,
  toUInt64(SUM(connections)) AS totalConnections
FROM ${this.config.database}.country_minute
WHERE backend_id = ${backendId}
  AND minute >= toDateTime('${this.toDateTime(start)}')
  AND minute <= toDateTime('${this.toDateTime(end)}')
GROUP BY country
ORDER BY (SUM(upload) + SUM(download)) DESC
LIMIT ${Math.max(1, limit)}
`);
    if (!rows) return null;
    return (rows as Array<any>).map((row) => ({
      country: String(row.country || 'UNKNOWN'),
      countryName: String(row.countryName || row.country || 'Unknown'),
      continent: String(row.continent || 'Unknown'),
      totalUpload: Number(row.totalUpload || 0),
      totalDownload: Number(row.totalDownload || 0),
      totalConnections: Number(row.totalConnections || 0),
    }));
  }

  async getTrafficInRange(
    backendId: number,
    start: string,
    end: string,
  ): Promise<{ upload: number; download: number } | null> {
    const rows = await this.query<Record<string, unknown>>(`
SELECT
  toUInt64(COALESCE(SUM(upload), 0)) AS upload,
  toUInt64(COALESCE(SUM(download), 0)) AS download
FROM ${this.config.database}.traffic_minute
WHERE backend_id = ${backendId}
  AND minute >= toDateTime('${this.toDateTime(start)}')
  AND minute <= toDateTime('${this.toDateTime(end)}')
`);
    if (!rows || rows.length === 0) return null;
    const first = rows[0] as Record<string, unknown>;
    return {
      upload: Number(first.upload || 0),
      download: Number(first.download || 0),
    };
  }

  async getTrafficTrend(
    backendId: number,
    start: string,
    end: string,
  ): Promise<Array<{ time: string; upload: number; download: number }> | null> {
    const rows = await this.query<Record<string, unknown>>(`
SELECT
  toString(minute) AS time,
  toUInt64(SUM(upload)) AS upload,
  toUInt64(SUM(download)) AS download
FROM ${this.config.database}.traffic_minute
WHERE backend_id = ${backendId}
  AND minute >= toDateTime('${this.toDateTime(start)}')
  AND minute <= toDateTime('${this.toDateTime(end)}')
GROUP BY minute
ORDER BY minute ASC
`);
    if (!rows) return null;
    return (rows as Array<any>).map((row) => ({
      time: String(row.time || ''),
      upload: Number(row.upload || 0),
      download: Number(row.download || 0),
    }));
  }

  async getTrafficTrendAggregated(
    backendId: number,
    bucketMinutes: number,
    start: string,
    end: string,
  ): Promise<Array<{ time: string; upload: number; download: number }> | null> {
    const safeBucket = Math.max(1, Math.floor(bucketMinutes));
    const bucketExpr =
      safeBucket <= 1
        ? 'minute'
        : `toStartOfInterval(minute, INTERVAL ${safeBucket} MINUTE)`;

    const rows = await this.query<Record<string, unknown>>(`
SELECT
  toString(${bucketExpr}) AS time,
  toUInt64(SUM(upload)) AS upload,
  toUInt64(SUM(download)) AS download
FROM ${this.config.database}.traffic_minute
WHERE backend_id = ${backendId}
  AND minute >= toDateTime('${this.toDateTime(start)}')
  AND minute <= toDateTime('${this.toDateTime(end)}')
GROUP BY time
ORDER BY time ASC
`);
    if (!rows) return null;
    return (rows as Array<any>).map((row) => ({
      time: String(row.time || ''),
      upload: Number(row.upload || 0),
      download: Number(row.download || 0),
    }));
  }

  async getDomainStatsPaginated(
    backendId: number,
    start: string,
    end: string,
    opts: {
      offset?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: string;
      search?: string;
    },
  ): Promise<{ data: DomainStats[]; total: number } | null> {
    const offset = Math.max(0, opts.offset || 0);
    const limit = Math.max(1, Math.min(200, opts.limit || 50));
    const sortOrder = opts.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const sortExprMap: Record<string, string> = {
      domain: 'domain',
      totalUpload: 'totalUpload',
      totalDownload: 'totalDownload',
      totalTraffic: '(totalUpload + totalDownload)',
      totalConnections: 'totalConnections',
      lastSeen: 'lastSeen',
    };
    const sortExpr = sortExprMap[opts.sortBy || 'totalDownload'] || 'totalDownload';
    const searchClause = opts.search
      ? ` AND positionCaseInsensitive(domain, '${this.esc(opts.search)}') > 0`
      : '';

    const totalRows = await this.query<Record<string, unknown>>(`
SELECT toUInt64(COUNT()) AS total
FROM (
  SELECT domain
  FROM ${this.config.database}.traffic_minute
  WHERE backend_id = ${backendId}
    AND minute >= toDateTime('${this.toDateTime(start)}')
    AND minute <= toDateTime('${this.toDateTime(end)}')
    AND domain != '' ${searchClause}
  GROUP BY domain
)
`);

    const rows = await this.query<Record<string, unknown>>(`
SELECT
  domain,
  arrayDistinct(groupArrayIf(ip, ip != '')) AS ips,
  toUInt64(SUM(upload)) AS totalUpload,
  toUInt64(SUM(download)) AS totalDownload,
  toUInt64(SUM(connections)) AS totalConnections,
  toString(max(minute)) AS lastSeen,
  arrayDistinct(groupArrayIf(rule, rule != '')) AS rules,
  arrayDistinct(groupArrayIf(chain, chain != '')) AS chains
FROM ${this.config.database}.traffic_minute
WHERE backend_id = ${backendId}
  AND minute >= toDateTime('${this.toDateTime(start)}')
  AND minute <= toDateTime('${this.toDateTime(end)}')
  AND domain != '' ${searchClause}
GROUP BY domain
ORDER BY ${sortExpr} ${sortOrder}
LIMIT ${limit} OFFSET ${offset}
`);
    if (!rows || !totalRows) return null;

    const total = Number(totalRows[0]?.total || 0);
    const data = (rows as Array<any>).map((row) => ({
      domain: String(row.domain || ''),
      ips: Array.isArray(row.ips) ? row.ips.map(String) : [],
      totalUpload: Number(row.totalUpload || 0),
      totalDownload: Number(row.totalDownload || 0),
      totalConnections: Number(row.totalConnections || 0),
      lastSeen: String(row.lastSeen || ''),
      rules: Array.isArray(row.rules) ? row.rules.map(String) : [],
      chains: Array.isArray(row.chains) ? row.chains.map(String) : [],
    })) as DomainStats[];

    return { data, total };
  }

  async getIPStatsPaginated(
    backendId: number,
    start: string,
    end: string,
    opts: {
      offset?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: string;
      search?: string;
    },
  ): Promise<{ data: IPStats[]; total: number } | null> {
    const offset = Math.max(0, opts.offset || 0);
    const limit = Math.max(1, Math.min(200, opts.limit || 50));
    const sortOrder = opts.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const sortExprMap: Record<string, string> = {
      ip: 'ip',
      totalUpload: 'totalUpload',
      totalDownload: 'totalDownload',
      totalTraffic: '(totalUpload + totalDownload)',
      totalConnections: 'totalConnections',
      lastSeen: 'lastSeen',
    };
    const sortExpr = sortExprMap[opts.sortBy || 'totalDownload'] || 'totalDownload';
    const searchClause = opts.search
      ? ` AND (positionCaseInsensitive(ip, '${this.esc(opts.search)}') > 0 OR positionCaseInsensitive(domain, '${this.esc(opts.search)}') > 0)`
      : '';

    const totalRows = await this.query<Record<string, unknown>>(`
SELECT toUInt64(COUNT()) AS total
FROM (
  SELECT ip
  FROM ${this.config.database}.traffic_minute
  WHERE backend_id = ${backendId}
    AND minute >= toDateTime('${this.toDateTime(start)}')
    AND minute <= toDateTime('${this.toDateTime(end)}')
    AND ip != '' ${searchClause}
  GROUP BY ip
)
`);

    const rows = await this.query<Record<string, unknown>>(`
SELECT
  ip,
  arrayDistinct(groupArrayIf(domain, domain != '')) AS domains,
  toUInt64(SUM(upload)) AS totalUpload,
  toUInt64(SUM(download)) AS totalDownload,
  toUInt64(SUM(connections)) AS totalConnections,
  toString(max(minute)) AS lastSeen,
  arrayDistinct(groupArrayIf(chain, chain != '')) AS chains
FROM ${this.config.database}.traffic_minute
WHERE backend_id = ${backendId}
  AND minute >= toDateTime('${this.toDateTime(start)}')
  AND minute <= toDateTime('${this.toDateTime(end)}')
  AND ip != '' ${searchClause}
GROUP BY ip
ORDER BY ${sortExpr} ${sortOrder}
LIMIT ${limit} OFFSET ${offset}
`);
    if (!rows || !totalRows) return null;

    const total = Number(totalRows[0]?.total || 0);
    const data = (rows as Array<any>).map((row) => ({
      ip: String(row.ip || ''),
      domains: Array.isArray(row.domains) ? row.domains.map(String) : [],
      totalUpload: Number(row.totalUpload || 0),
      totalDownload: Number(row.totalDownload || 0),
      totalConnections: Number(row.totalConnections || 0),
      lastSeen: String(row.lastSeen || ''),
      chains: Array.isArray(row.chains) ? row.chains.map(String) : [],
    })) as IPStats[];

    return { data, total };
  }

  async getProxyStats(backendId: number, start: string, end: string): Promise<any[] | null> {
    const rows = await this.query<any>(`
SELECT
  chain,
  toUInt64(SUM(upload)) AS totalUpload,
  toUInt64(SUM(download)) AS totalDownload,
  toUInt64(SUM(connections)) AS totalConnections,
  toString(max(minute)) AS lastSeen
FROM ${this.config.database}.traffic_minute
WHERE backend_id = ${backendId}
  AND minute >= toDateTime('${this.toDateTime(start)}')
  AND minute <= toDateTime('${this.toDateTime(end)}')
GROUP BY chain
ORDER BY (SUM(upload) + SUM(download)) DESC
`);
    if (!rows) return null;
    return rows.map((row: any) => ({
      chain: String(row.chain || ''),
      totalUpload: Number(row.totalUpload || 0),
      totalDownload: Number(row.totalDownload || 0),
      totalConnections: Number(row.totalConnections || 0),
      lastSeen: String(row.lastSeen || ''),
    }));
  }

  async getRuleStats(backendId: number, start: string, end: string): Promise<any[] | null> {
    const rows = await this.query<any>(`
SELECT
  rule,
  any(chain) AS finalProxy,
  toUInt64(SUM(upload)) AS totalUpload,
  toUInt64(SUM(download)) AS totalDownload,
  toUInt64(SUM(connections)) AS totalConnections,
  toString(max(minute)) AS lastSeen
FROM ${this.config.database}.traffic_minute
WHERE backend_id = ${backendId}
  AND minute >= toDateTime('${this.toDateTime(start)}')
  AND minute <= toDateTime('${this.toDateTime(end)}')
GROUP BY rule
ORDER BY (SUM(upload) + SUM(download)) DESC
`);
    if (!rows) return null;
    return rows.map((row: any) => ({
      rule: String(row.rule || ''),
      finalProxy: String(row.finalProxy || ''),
      totalUpload: Number(row.totalUpload || 0),
      totalDownload: Number(row.totalDownload || 0),
      totalConnections: Number(row.totalConnections || 0),
      lastSeen: String(row.lastSeen || ''),
    }));
  }

  async getDeviceStats(backendId: number, start: string, end: string, limit: number): Promise<any[] | null> {
    const rows = await this.query<any>(`
SELECT
  source_ip AS sourceIP,
  toUInt64(SUM(upload)) AS totalUpload,
  toUInt64(SUM(download)) AS totalDownload,
  toUInt64(SUM(connections)) AS totalConnections,
  toString(max(minute)) AS lastSeen
FROM ${this.config.database}.traffic_minute
WHERE backend_id = ${backendId}
  AND minute >= toDateTime('${this.toDateTime(start)}')
  AND minute <= toDateTime('${this.toDateTime(end)}')
  AND source_ip != ''
GROUP BY source_ip
ORDER BY (SUM(upload) + SUM(download)) DESC
LIMIT ${Math.max(1, limit)}
`);
    if (!rows) return null;
    return rows.map((row: any) => ({
      sourceIP: String(row.sourceIP || ''),
      totalUpload: Number(row.totalUpload || 0),
      totalDownload: Number(row.totalDownload || 0),
      totalConnections: Number(row.totalConnections || 0),
      lastSeen: String(row.lastSeen || ''),
    }));
  }

  async getGroupedDomains(
    backendId: number,
    start: string,
    end: string,
    limit: number,
    filters: {
      chain?: string;
      rule?: string;
      sourceIP?: string;
      domain?: string;
      ip?: string;
    },
  ): Promise<DomainStats[] | null> {
    const clauses = this.buildFilters(filters);
    const rows = await this.query<any>(`
SELECT
  domain,
  arrayDistinct(groupArrayIf(ip, ip != '')) AS ips,
  toUInt64(SUM(upload)) AS totalUpload,
  toUInt64(SUM(download)) AS totalDownload,
  toUInt64(SUM(connections)) AS totalConnections,
  toString(max(minute)) AS lastSeen,
  arrayDistinct(groupArrayIf(rule, rule != '')) AS rules,
  arrayDistinct(groupArrayIf(chain, chain != '')) AS chains
FROM ${this.config.database}.traffic_minute
WHERE backend_id = ${backendId}
  AND minute >= toDateTime('${this.toDateTime(start)}')
  AND minute <= toDateTime('${this.toDateTime(end)}')
  AND domain != '' ${clauses}
GROUP BY domain
ORDER BY (SUM(upload) + SUM(download)) DESC
LIMIT ${Math.max(1, limit)}
`);
    if (!rows) return null;
    return rows.map((row: any) => ({
      domain: String(row.domain || ''),
      ips: Array.isArray(row.ips) ? row.ips.map(String) : [],
      totalUpload: Number(row.totalUpload || 0),
      totalDownload: Number(row.totalDownload || 0),
      totalConnections: Number(row.totalConnections || 0),
      lastSeen: String(row.lastSeen || ''),
      rules: Array.isArray(row.rules) ? row.rules.map(String) : [],
      chains: Array.isArray(row.chains) ? row.chains.map(String) : [],
    }));
  }

  async getGroupedIPs(
    backendId: number,
    start: string,
    end: string,
    limit: number,
    filters: {
      chain?: string;
      rule?: string;
      sourceIP?: string;
      domain?: string;
      ip?: string;
    },
  ): Promise<IPStats[] | null> {
    const clauses = this.buildFilters(filters);
    const rows = await this.query<any>(`
SELECT
  ip,
  arrayDistinct(groupArrayIf(domain, domain != '')) AS domains,
  toUInt64(SUM(upload)) AS totalUpload,
  toUInt64(SUM(download)) AS totalDownload,
  toUInt64(SUM(connections)) AS totalConnections,
  toString(max(minute)) AS lastSeen,
  arrayDistinct(groupArrayIf(chain, chain != '')) AS chains
FROM ${this.config.database}.traffic_minute
WHERE backend_id = ${backendId}
  AND minute >= toDateTime('${this.toDateTime(start)}')
  AND minute <= toDateTime('${this.toDateTime(end)}')
  AND ip != '' ${clauses}
GROUP BY ip
ORDER BY (SUM(upload) + SUM(download)) DESC
LIMIT ${Math.max(1, limit)}
`);
    if (!rows) return null;
    return rows.map((row: any) => ({
      ip: String(row.ip || ''),
      domains: Array.isArray(row.domains) ? row.domains.map(String) : [],
      totalUpload: Number(row.totalUpload || 0),
      totalDownload: Number(row.totalDownload || 0),
      totalConnections: Number(row.totalConnections || 0),
      lastSeen: String(row.lastSeen || ''),
      chains: Array.isArray(row.chains) ? row.chains.map(String) : [],
    }));
  }

  async getGroupedProxyStats(
    backendId: number,
    start: string,
    end: string,
    filters: {
      chain?: string;
      rule?: string;
      sourceIP?: string;
      domain?: string;
      ip?: string;
    },
  ): Promise<any[] | null> {
    const clauses = this.buildFilters(filters);
    const rows = await this.query<any>(`
SELECT
  chain,
  toUInt64(SUM(upload)) AS totalUpload,
  toUInt64(SUM(download)) AS totalDownload,
  toUInt64(SUM(connections)) AS totalConnections
FROM ${this.config.database}.traffic_minute
WHERE backend_id = ${backendId}
  AND minute >= toDateTime('${this.toDateTime(start)}')
  AND minute <= toDateTime('${this.toDateTime(end)}')
  AND chain != '' ${clauses}
GROUP BY chain
ORDER BY (SUM(upload) + SUM(download)) DESC
`);
    if (!rows) return null;
    return rows.map((row: any) => ({
      chain: String(row.chain || ''),
      totalUpload: Number(row.totalUpload || 0),
      totalDownload: Number(row.totalDownload || 0),
      totalConnections: Number(row.totalConnections || 0),
    }));
  }

  private async query<T>(query: string): Promise<T[] | null> {
    if (!this.config.enabled) return null;
    const baseUrl = `${this.config.protocol}://${this.config.host}:${this.config.port}`;
    const authHeader =
      this.config.password.length > 0
        ? `Basic ${Buffer.from(`${this.config.user}:${this.config.password}`).toString('base64')}`
        : '';

    try {
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
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`status=${response.status} body=${body.slice(0, 160)}`);
      }
      const json = (await response.json()) as { data?: T[] };
      return json.data || [];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.source === 'clickhouse') {
        throw new Error(`[ClickHouse Reader] strict mode query failed: ${message}`);
      }
      console.warn(`[ClickHouse Reader] query failed, fallback to sqlite: ${message}`);
      return null;
    }
  }

  private toDateTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '1970-01-01 00:00:00';
    }
    return date.toISOString().slice(0, 19).replace('T', ' ');
  }

  private buildFilters(filters: Record<string, string | undefined>): string {
    const clauses: string[] = [];
    if (filters.chain) clauses.push(`chain = '${this.esc(filters.chain)}'`);
    if (filters.rule) clauses.push(`rule = '${this.esc(filters.rule)}'`);
    if (filters.sourceIP) clauses.push(`source_ip = '${this.esc(filters.sourceIP)}'`);
    if (filters.domain) clauses.push(`domain = '${this.esc(filters.domain)}'`);
    if (filters.ip) clauses.push(`ip = '${this.esc(filters.ip)}'`);
    if (clauses.length === 0) return '';
    return ` AND ${clauses.join(' AND ')}`;
  }

  private esc(value: string): string {
    return value.replace(/'/g, "''");
  }

  private parseSource(value: string | undefined): StatsQuerySource {
    const normalized = String(value || 'sqlite').trim().toLowerCase();
    if (normalized === 'clickhouse' || normalized === 'auto') {
      return normalized;
    }
    return 'sqlite';
  }
}
