import { WebSocketServer as WSServer, WebSocket } from 'ws';
import type { StatsSummary, DomainStats, IPStats, ProxyStats, CountryStats, DeviceStats, RuleStats, HourlyStats } from '@neko-master/shared';
import type { StatsDatabase } from './db.js';
import { realtimeStore } from './realtime.js';
import { AuthService } from './modules/auth/auth.service.js';
import { IncomingMessage } from 'http';
import { URL } from 'url';

export interface WebSocketMessage {
  type: 'stats' | 'ping' | 'pong' | 'subscribe';
  backendId?: number;
  start?: string;
  end?: string;
  minPushIntervalMs?: number;
  includeTrend?: boolean;
  trendMinutes?: number;
  trendBucketMinutes?: number;
  includeDeviceDetails?: boolean;
  deviceSourceIP?: string;
  deviceDetailLimit?: number;
  includeProxyDetails?: boolean;
  proxyChain?: string;
  proxyDetailLimit?: number;
  includeRuleDetails?: boolean;
  ruleName?: string;
  ruleDetailLimit?: number;
  includeRuleChainFlow?: boolean;
  includeDomainsPage?: boolean;
  domainsPageOffset?: number;
  domainsPageLimit?: number;
  domainsPageSortBy?: string;
  domainsPageSortOrder?: string;
  domainsPageSearch?: string;
  includeIPsPage?: boolean;
  ipsPageOffset?: number;
  ipsPageLimit?: number;
  ipsPageSortBy?: string;
  ipsPageSortOrder?: string;
  ipsPageSearch?: string;
  data?: StatsSummary;
  timestamp: string;
}

type ClientRange = {
  start?: string;
  end?: string;
};

type ClientTrend = {
  minutes: number;
  bucketMinutes: number;
} | null;

type ClientDeviceDetail = {
  sourceIP: string;
  limit: number;
} | null;

type ClientProxyDetail = {
  chain: string;
  limit: number;
} | null;

type ClientRuleDetail = {
  rule: string;
  limit: number;
} | null;

type ClientDomainsPage = {
  offset: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
} | null;

type ClientIPsPage = {
  offset: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
} | null;

interface ClientInfo {
  ws: WebSocket;
  backendId: number | null; // null means use active backend
  range: ClientRange;
  minPushIntervalMs: number;
  lastSentAt: number;
  trend: ClientTrend;
  deviceDetail: ClientDeviceDetail;
  proxyDetail: ClientProxyDetail;
  ruleDetail: ClientRuleDetail;
  includeRuleChainFlow: boolean;
  domainsPage: ClientDomainsPage;
  ipsPage: ClientIPsPage;
}

export class StatsWebSocketServer {
  private wss: WSServer | null = null;
  private db: StatsDatabase;
  private authService: AuthService;
  private clients: Map<WebSocket, ClientInfo> = new Map();
  private port: number;
  private lastBroadcastTime = 0;
  private broadcastThrottleMs = 1000; // minimum interval between broadcasts
  // Cache for expensive full-summary queries: avoids re-querying all 8 base tables
  // when multiple broadcasts fire within a short window.
  private baseSummaryCache = new Map<string, {
    summary: { totalConnections: number; totalUpload: number; totalDownload: number; uniqueDomains: number; uniqueIPs: number };
    topDomains: DomainStats[];
    topIPs: IPStats[];
    proxyStats: ProxyStats[];
    countryStats: CountryStats[];
    deviceStats: DeviceStats[];
    ruleStats: RuleStats[];
    hourlyStats: HourlyStats[];
    ts: number;
  }>();
  private static BASE_SUMMARY_CACHE_TTL_MS = 2000;
  private static BASE_SUMMARY_CACHE_TTL_HISTORICAL_MS = 300000; // 5 minutes for historical ranges
  private wsMetricsLogIntervalMs = Math.max(
    1000,
    parseInt(process.env.WS_METRICS_LOG_INTERVAL_MS || '60000', 10) || 60000,
  );
  private wsMetricsWindowStartedAt = Date.now();
  private wsMetrics = {
    subscribeTotal: 0,
    subscribeChanged: 0,
    subscribeNoop: 0,
    getStatsCalls: 0,
    fullSummaryCalls: 0,
    baseCacheHit: 0,
    baseCacheMiss: 0,
    trendCalls: 0,
    detailCalls: 0,
    pagedCalls: 0,
    broadcastCalls: 0,
    broadcastSentClients: 0,
  };

  constructor(port: number, db: StatsDatabase) {
    this.port = port;
    this.db = db;
    this.authService = new AuthService(db);
  }

  start() {
    this.wss = new WSServer({
      port: this.port,
      host: '0.0.0.0',
      perMessageDeflate: false,
    });

    this.wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
      console.log(`[WebSocket] Connection attempt from ${req.socket.remoteAddress}`);

      // Verify authentication
      try {
        const url = new URL(req.url || '', `http://${req.headers.host}`);
        let token = url.searchParams.get('token');
        
        // Try getting token from cookie if not in URL
        if (!token && req.headers.cookie) {
          const cookies = req.headers.cookie.split(';').reduce((acc, cookie) => {
            const [key, value] = cookie.trim().split('=');
            acc[key] = value;
            return acc;
          }, {} as Record<string, string>);
          
          if (cookies['neko-session']) {
            token = cookies['neko-session'];
          }
        }
        
        // Check if auth is required and verify token
        if (this.authService.isAuthRequired()) {
          if (!token) {
            console.log(`[WebSocket] Rejected connection from ${req.socket.remoteAddress}: Missing token or cookie`);
            ws.close(4001, 'Authentication required');
            return;
          }

          const verifyResult = await this.authService.verifyToken(token);
          if (!verifyResult.valid) {
            console.log(`[WebSocket] Rejected connection from ${req.socket.remoteAddress}: Invalid token`);
            ws.close(4003, 'Invalid token');
            return;
          }
        }
      } catch (error) {
        console.error('[WebSocket] Error verifying auth:', error);
        ws.close(4000, 'Internal server error');
        return;
      }

      console.log(`[WebSocket] connection authorized from ${req.socket.remoteAddress}`);
      console.log(`[WebSocket] Client connected, total: ${this.clients.size + 1}`);

      const clientInfo: ClientInfo = {
        ws,
        backendId: null,
        range: {},
        minPushIntervalMs: 0,
        lastSentAt: 0,
        trend: null,
        deviceDetail: null,
        proxyDetail: null,
        ruleDetail: null,
        includeRuleChainFlow: false,
        domainsPage: null,
        ipsPage: null,
      };
      this.clients.set(ws, clientInfo);

      // Push an initial snapshot immediately.
      this.sendStatsToClient(ws);

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString()) as WebSocketMessage;

          if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
            return;
          }

          if (msg.type === 'subscribe') {
            this.wsMetrics.subscribeTotal += 1;
            let changed = false;

            if (msg.backendId !== undefined) {
              const backend = this.db.getBackend(msg.backendId);
              if (backend) {
                if (clientInfo.backendId !== msg.backendId) {
                  clientInfo.backendId = msg.backendId;
                  changed = true;
                  console.log(`[WebSocket] Client subscribed to backend: ${backend.name} (ID: ${msg.backendId})`);
                }
              } else {
                console.warn(`[WebSocket] Client tried to subscribe to non-existent backend: ${msg.backendId}`);
              }
            }

            if (msg.start !== undefined || msg.end !== undefined) {
              const parsedRange = this.parseRange(msg.start, msg.end);
              if (parsedRange) {
                if (!this.isRangeEqual(clientInfo.range, parsedRange)) {
                  clientInfo.range = parsedRange;
                  changed = true;
                }
              }
            }

            if (msg.minPushIntervalMs !== undefined) {
              const nextMinPushIntervalMs = this.parseMinPushIntervalMs(
                msg.minPushIntervalMs,
                clientInfo.minPushIntervalMs,
              );
              if (nextMinPushIntervalMs !== clientInfo.minPushIntervalMs) {
                clientInfo.minPushIntervalMs = nextMinPushIntervalMs;
                changed = true;
              }
            }

            if (
              msg.includeTrend !== undefined ||
              msg.trendMinutes !== undefined ||
              msg.trendBucketMinutes !== undefined
            ) {
              const parsedTrend = this.parseTrend(
                msg.includeTrend,
                msg.trendMinutes,
                msg.trendBucketMinutes,
                clientInfo.range,
              );
              if (parsedTrend !== undefined) {
                if (!this.isTrendEqual(clientInfo.trend, parsedTrend)) {
                  clientInfo.trend = parsedTrend;
                  changed = true;
                }
              }
            }
            if (
              msg.includeDeviceDetails !== undefined ||
              msg.deviceSourceIP !== undefined ||
              msg.deviceDetailLimit !== undefined
            ) {
              const parsedDeviceDetail = this.parseDeviceDetail(
                msg.includeDeviceDetails,
                msg.deviceSourceIP,
                msg.deviceDetailLimit,
              );
              if (parsedDeviceDetail !== undefined) {
                if (!this.isDeviceDetailEqual(clientInfo.deviceDetail, parsedDeviceDetail)) {
                  clientInfo.deviceDetail = parsedDeviceDetail;
                  changed = true;
                }
              }
            }
            if (
              msg.includeProxyDetails !== undefined ||
              msg.proxyChain !== undefined ||
              msg.proxyDetailLimit !== undefined
            ) {
              const parsedProxyDetail = this.parseProxyDetail(
                msg.includeProxyDetails,
                msg.proxyChain,
                msg.proxyDetailLimit,
              );
              if (parsedProxyDetail !== undefined) {
                if (!this.isProxyDetailEqual(clientInfo.proxyDetail, parsedProxyDetail)) {
                  clientInfo.proxyDetail = parsedProxyDetail;
                  changed = true;
                }
              }
            }
            if (
              msg.includeRuleDetails !== undefined ||
              msg.ruleName !== undefined ||
              msg.ruleDetailLimit !== undefined
            ) {
              const parsedRuleDetail = this.parseRuleDetail(
                msg.includeRuleDetails,
                msg.ruleName,
                msg.ruleDetailLimit,
              );
              if (parsedRuleDetail !== undefined) {
                if (!this.isRuleDetailEqual(clientInfo.ruleDetail, parsedRuleDetail)) {
                  clientInfo.ruleDetail = parsedRuleDetail;
                  changed = true;
                }
              }
            }
            if (msg.includeRuleChainFlow !== undefined) {
              const nextIncludeRuleChainFlow = !!msg.includeRuleChainFlow;
              if (nextIncludeRuleChainFlow !== clientInfo.includeRuleChainFlow) {
                clientInfo.includeRuleChainFlow = nextIncludeRuleChainFlow;
                changed = true;
              }
            }
            if (
              msg.includeDomainsPage !== undefined ||
              msg.domainsPageOffset !== undefined ||
              msg.domainsPageLimit !== undefined ||
              msg.domainsPageSortBy !== undefined ||
              msg.domainsPageSortOrder !== undefined ||
              msg.domainsPageSearch !== undefined
            ) {
              const parsedDomainsPage = this.parseDomainsPage(
                msg.includeDomainsPage,
                msg.domainsPageOffset,
                msg.domainsPageLimit,
                msg.domainsPageSortBy,
                msg.domainsPageSortOrder,
                msg.domainsPageSearch,
              );
              if (parsedDomainsPage !== undefined) {
                if (!this.isDomainsPageEqual(clientInfo.domainsPage, parsedDomainsPage)) {
                  clientInfo.domainsPage = parsedDomainsPage;
                  changed = true;
                }
              }
            }
            if (
              msg.includeIPsPage !== undefined ||
              msg.ipsPageOffset !== undefined ||
              msg.ipsPageLimit !== undefined ||
              msg.ipsPageSortBy !== undefined ||
              msg.ipsPageSortOrder !== undefined ||
              msg.ipsPageSearch !== undefined
            ) {
              const parsedIPsPage = this.parseIPsPage(
                msg.includeIPsPage,
                msg.ipsPageOffset,
                msg.ipsPageLimit,
                msg.ipsPageSortBy,
                msg.ipsPageSortOrder,
                msg.ipsPageSearch,
              );
              if (parsedIPsPage !== undefined) {
                if (!this.isIPsPageEqual(clientInfo.ipsPage, parsedIPsPage)) {
                  clientInfo.ipsPage = parsedIPsPage;
                  changed = true;
                }
              }
            }

            if (changed) {
              this.wsMetrics.subscribeChanged += 1;
              this.sendStatsToClient(ws);
            } else {
              this.wsMetrics.subscribeNoop += 1;
            }
            this.maybeLogWsMetrics();
          }
        } catch {
          // Ignore invalid frames.
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        console.log(`[WebSocket] Client disconnected, remaining: ${this.clients.size}`);
      });

      ws.on('error', (err) => {
        console.error('[WebSocket] Client error:', err.message);
        this.clients.delete(ws);
      });
    });

    console.log(`[WebSocket] Server running at ws://0.0.0.0:${this.port}`);
  }

  private parseRange(start?: string, end?: string): ClientRange | null {
    if (start === undefined && end === undefined) {
      return {};
    }

    if (!start || !end) {
      return null;
    }

    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return null;
    }
    if (startDate > endDate) {
      return null;
    }

    return {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    };
  }

  private parseMinPushIntervalMs(
    value: number,
    fallback: number,
  ): number {
    if (!Number.isFinite(value)) return fallback;
    // Keep range conservative to avoid client misuse.
    return Math.max(0, Math.min(60_000, Math.floor(value)));
  }

  private isRangeEqual(a: ClientRange, b: ClientRange): boolean {
    return (a.start || '') === (b.start || '') && (a.end || '') === (b.end || '');
  }

  private isTrendEqual(a: ClientTrend, b: ClientTrend): boolean {
    if (a === null && b === null) return true;
    if (!a || !b) return false;
    return a.minutes === b.minutes && a.bucketMinutes === b.bucketMinutes;
  }

  private isDeviceDetailEqual(a: ClientDeviceDetail, b: ClientDeviceDetail): boolean {
    if (a === null && b === null) return true;
    if (!a || !b) return false;
    return a.sourceIP === b.sourceIP && a.limit === b.limit;
  }

  private isProxyDetailEqual(a: ClientProxyDetail, b: ClientProxyDetail): boolean {
    if (a === null && b === null) return true;
    if (!a || !b) return false;
    return a.chain === b.chain && a.limit === b.limit;
  }

  private isRuleDetailEqual(a: ClientRuleDetail, b: ClientRuleDetail): boolean {
    if (a === null && b === null) return true;
    if (!a || !b) return false;
    return a.rule === b.rule && a.limit === b.limit;
  }

  private isDomainsPageEqual(a: ClientDomainsPage, b: ClientDomainsPage): boolean {
    if (a === null && b === null) return true;
    if (!a || !b) return false;
    return (
      a.offset === b.offset &&
      a.limit === b.limit &&
      (a.sortBy || '') === (b.sortBy || '') &&
      (a.sortOrder || '') === (b.sortOrder || '') &&
      (a.search || '') === (b.search || '')
    );
  }

  private isIPsPageEqual(a: ClientIPsPage, b: ClientIPsPage): boolean {
    if (a === null && b === null) return true;
    if (!a || !b) return false;
    return (
      a.offset === b.offset &&
      a.limit === b.limit &&
      (a.sortBy || '') === (b.sortBy || '') &&
      (a.sortOrder || '') === (b.sortOrder || '') &&
      (a.search || '') === (b.search || '')
    );
  }

  private shouldIncludeRealtime(range: ClientRange): boolean {
    if (!range.start && !range.end) {
      return true;
    }
    if (!range.end) {
      return false;
    }

    const endMs = new Date(range.end).getTime();
    if (Number.isNaN(endMs)) {
      return false;
    }

    const toleranceMs = parseInt(process.env.REALTIME_RANGE_END_TOLERANCE_MS || '120000', 10);
    const windowMs = Number.isFinite(toleranceMs) ? Math.max(10_000, toleranceMs) : 120_000;
    return endMs >= Date.now() - windowMs;
  }

  private parsePositiveInt(value: number | undefined): number | null {
    if (value === undefined) return null;
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  }

  private parseNonNegativeInt(value: number | undefined): number | null {
    if (value === undefined) return null;
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return parsed;
  }

  private resolveMinutesFromRange(range: ClientRange): number | null {
    if (!range.start || !range.end) return null;
    const startMs = new Date(range.start).getTime();
    const endMs = new Date(range.end).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
      return null;
    }
    return Math.max(1, Math.ceil((endMs - startMs) / 60000));
  }

  private parseTrend(
    includeTrend: boolean | undefined,
    trendMinutes: number | undefined,
    trendBucketMinutes: number | undefined,
    range: ClientRange,
  ): ClientTrend | undefined {
    if (includeTrend === false) return null;
    if (
      includeTrend !== true &&
      trendMinutes === undefined &&
      trendBucketMinutes === undefined
    ) {
      return undefined;
    }

    const parsedMinutes = this.parsePositiveInt(trendMinutes);
    const parsedBucket = this.parsePositiveInt(trendBucketMinutes);
    if (trendMinutes !== undefined && parsedMinutes === null) return undefined;
    if (trendBucketMinutes !== undefined && parsedBucket === null) return undefined;

    const fallbackMinutes = this.resolveMinutesFromRange(range) ?? 30;
    const minutes = Math.min(parsedMinutes ?? fallbackMinutes, 30 * 24 * 60);
    const bucketMinutes = Math.min(parsedBucket ?? 1, 24 * 60);

    return {
      minutes,
      bucketMinutes,
    };
  }

  private parseDeviceDetail(
    includeDeviceDetails: boolean | undefined,
    deviceSourceIP: string | undefined,
    deviceDetailLimit: number | undefined,
  ): ClientDeviceDetail | undefined {
    if (includeDeviceDetails === false) return null;
    if (
      includeDeviceDetails !== true &&
      deviceSourceIP === undefined &&
      deviceDetailLimit === undefined
    ) {
      return undefined;
    }

    const sourceIP = (deviceSourceIP || '').trim();
    if (!sourceIP) return undefined;

    const parsedLimit = this.parsePositiveInt(deviceDetailLimit);
    if (deviceDetailLimit !== undefined && parsedLimit === null) {
      return undefined;
    }

    return {
      sourceIP,
      limit: Math.min(parsedLimit ?? 5000, 20000),
    };
  }

  private parseProxyDetail(
    includeProxyDetails: boolean | undefined,
    proxyChain: string | undefined,
    proxyDetailLimit: number | undefined,
  ): ClientProxyDetail | undefined {
    if (includeProxyDetails === false) return null;
    if (
      includeProxyDetails !== true &&
      proxyChain === undefined &&
      proxyDetailLimit === undefined
    ) {
      return undefined;
    }

    const chain = (proxyChain || '').trim();
    if (!chain) return undefined;

    const parsedLimit = this.parsePositiveInt(proxyDetailLimit);
    if (proxyDetailLimit !== undefined && parsedLimit === null) {
      return undefined;
    }

    return {
      chain,
      limit: Math.min(parsedLimit ?? 5000, 20000),
    };
  }

  private parseRuleDetail(
    includeRuleDetails: boolean | undefined,
    ruleName: string | undefined,
    ruleDetailLimit: number | undefined,
  ): ClientRuleDetail | undefined {
    if (includeRuleDetails === false) return null;
    if (
      includeRuleDetails !== true &&
      ruleName === undefined &&
      ruleDetailLimit === undefined
    ) {
      return undefined;
    }

    const rule = (ruleName || '').trim();
    if (!rule) return undefined;

    const parsedLimit = this.parsePositiveInt(ruleDetailLimit);
    if (ruleDetailLimit !== undefined && parsedLimit === null) {
      return undefined;
    }

    return {
      rule,
      limit: Math.min(parsedLimit ?? 5000, 20000),
    };
  }

  private normalizePageSortOrder(sortOrder?: string): 'asc' | 'desc' {
    return sortOrder?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  }

  private normalizeDomainSortBy(sortBy?: string): string {
    const value = (sortBy || '').trim();
    switch (value) {
      case 'domain':
      case 'totalUpload':
      case 'totalTraffic':
      case 'totalConnections':
      case 'lastSeen':
      case 'totalDownload':
        return value;
      default:
        return 'totalDownload';
    }
  }

  private normalizeIPSortBy(sortBy?: string): string {
    const value = (sortBy || '').trim();
    switch (value) {
      case 'ip':
      case 'totalUpload':
      case 'totalTraffic':
      case 'totalConnections':
      case 'lastSeen':
      case 'totalDownload':
        return value;
      default:
        return 'totalDownload';
    }
  }

  private parseDomainsPage(
    includeDomainsPage: boolean | undefined,
    offset: number | undefined,
    limit: number | undefined,
    sortBy: string | undefined,
    sortOrder: string | undefined,
    search: string | undefined,
  ): ClientDomainsPage | undefined {
    if (includeDomainsPage === false) return null;
    if (
      includeDomainsPage !== true &&
      offset === undefined &&
      limit === undefined &&
      sortBy === undefined &&
      sortOrder === undefined &&
      search === undefined
    ) {
      return undefined;
    }

    const parsedOffset = this.parseNonNegativeInt(offset);
    const parsedLimit = this.parsePositiveInt(limit);
    if (offset !== undefined && parsedOffset === null) return undefined;
    if (limit !== undefined && parsedLimit === null) return undefined;

    return {
      offset: parsedOffset ?? 0,
      limit: Math.min(parsedLimit ?? 50, 200),
      sortBy: this.normalizeDomainSortBy(sortBy),
      sortOrder: this.normalizePageSortOrder(sortOrder),
      search: (search || '').trim() || undefined,
    };
  }

  private parseIPsPage(
    includeIPsPage: boolean | undefined,
    offset: number | undefined,
    limit: number | undefined,
    sortBy: string | undefined,
    sortOrder: string | undefined,
    search: string | undefined,
  ): ClientIPsPage | undefined {
    if (includeIPsPage === false) return null;
    if (
      includeIPsPage !== true &&
      offset === undefined &&
      limit === undefined &&
      sortBy === undefined &&
      sortOrder === undefined &&
      search === undefined
    ) {
      return undefined;
    }

    const parsedOffset = this.parseNonNegativeInt(offset);
    const parsedLimit = this.parsePositiveInt(limit);
    if (offset !== undefined && parsedOffset === null) return undefined;
    if (limit !== undefined && parsedLimit === null) return undefined;

    return {
      offset: parsedOffset ?? 0,
      limit: Math.min(parsedLimit ?? 50, 200),
      sortBy: this.normalizeIPSortBy(sortBy),
      sortOrder: this.normalizePageSortOrder(sortOrder),
      search: (search || '').trim() || undefined,
    };
  }

  private getBaseSummaryCacheTTL(range: ClientRange): number {
    if (!range.end) return StatsWebSocketServer.BASE_SUMMARY_CACHE_TTL_MS;
    const endMs = new Date(range.end).getTime();
    if (Number.isNaN(endMs)) return StatsWebSocketServer.BASE_SUMMARY_CACHE_TTL_MS;
    const toleranceMs = parseInt(process.env.REALTIME_RANGE_END_TOLERANCE_MS || '120000', 10);
    const windowMs = Number.isFinite(toleranceMs) ? Math.max(10_000, toleranceMs) : 120_000;
    return endMs >= Date.now() - windowMs
      ? StatsWebSocketServer.BASE_SUMMARY_CACHE_TTL_MS
      : StatsWebSocketServer.BASE_SUMMARY_CACHE_TTL_HISTORICAL_MS;
  }

  private resolveBackendId(rawBackendId: number | null): number | null {
    if (rawBackendId !== null) {
      return this.db.getBackend(rawBackendId) ? rawBackendId : null;
    }

    const activeBackend = this.db.getActiveBackend();
    return activeBackend?.id ?? null;
  }

  private getStatsForBackend(
    backendId: number | null,
    range: ClientRange,
    trend: ClientTrend,
    deviceDetail: ClientDeviceDetail,
    proxyDetail: ClientProxyDetail,
    ruleDetail: ClientRuleDetail,
    includeRuleChainFlow: boolean,
    domainsPage: ClientDomainsPage,
    ipsPage: ClientIPsPage,
  ): StatsSummary | null {
    this.wsMetrics.getStatsCalls += 1;
    const resolvedBackendId = this.resolveBackendId(backendId);
    if (resolvedBackendId === null) {
      return null;
    }

    const includeRealtime = this.shouldIncludeRealtime(range);
    const wantsFullSummary =
      !trend &&
      !deviceDetail &&
      !proxyDetail &&
      !ruleDetail &&
      !includeRuleChainFlow &&
      !domainsPage &&
      !ipsPage;

    if (wantsFullSummary) {
      this.wsMetrics.fullSummaryCalls += 1;
    }
    if (trend) this.wsMetrics.trendCalls += 1;
    if (deviceDetail || proxyDetail || ruleDetail || includeRuleChainFlow) {
      this.wsMetrics.detailCalls += 1;
    }
    if (domainsPage || ipsPage) {
      this.wsMetrics.pagedCalls += 1;
    }

    const cacheTTL = this.getBaseSummaryCacheTTL(range);

    const summary = wantsFullSummary
      ? (() => {
          const baseCacheKey = `${resolvedBackendId}|${range.start || ''}|${range.end || ''}`;
          const cached = this.baseSummaryCache.get(baseCacheKey);
          if (cached && Date.now() - cached.ts < cacheTTL) {
            return cached.summary;
          }
          const result = this.db.getSummary(resolvedBackendId, range.start, range.end);
          return result;
        })()
      : {
          totalUpload: 0,
          totalDownload: 0,
          totalConnections: 0,
          uniqueDomains: 0,
          uniqueIPs: 0,
        };

    // Use cached base summary data to avoid repeated expensive DB queries
    const baseCacheKey = `${resolvedBackendId}|${range.start || ''}|${range.end || ''}`;
    const baseCached = this.baseSummaryCache.get(baseCacheKey);
    const baseCacheValid = baseCached && Date.now() - baseCached.ts < cacheTTL;
    if (wantsFullSummary) {
      if (baseCacheValid) {
        this.wsMetrics.baseCacheHit += 1;
      } else {
        this.wsMetrics.baseCacheMiss += 1;
      }
    }

    const dbTopDomains = wantsFullSummary
      ? (baseCacheValid ? baseCached!.topDomains : this.db.getTopDomainsLight(resolvedBackendId, 100, range.start, range.end))
      : undefined;
    const topDomains = wantsFullSummary && dbTopDomains
      ? includeRealtime
        ? realtimeStore.mergeTopDomains(resolvedBackendId, dbTopDomains, 100)
        : dbTopDomains
      : [];

    const dbTopIPs = wantsFullSummary
      ? (baseCacheValid ? baseCached!.topIPs : this.db.getTopIPsLight(resolvedBackendId, 100, range.start, range.end))
      : undefined;
    const topIPs = wantsFullSummary && dbTopIPs
      ? includeRealtime
        ? realtimeStore.mergeTopIPs(resolvedBackendId, dbTopIPs, 100)
        : dbTopIPs
      : [];

    const dbProxyStats = wantsFullSummary
      ? (baseCacheValid ? baseCached!.proxyStats : this.db.getProxyStats(resolvedBackendId, range.start, range.end))
      : undefined;
    const proxyStats = wantsFullSummary && dbProxyStats
      ? includeRealtime
        ? realtimeStore.mergeProxyStats(resolvedBackendId, dbProxyStats)
        : dbProxyStats
      : [];

    const dbCountryStats = wantsFullSummary
      ? (baseCacheValid ? baseCached!.countryStats : this.db.getCountryStats(resolvedBackendId, 50, range.start, range.end))
      : undefined;
    const countryStats = wantsFullSummary && dbCountryStats
      ? includeRealtime
        ? realtimeStore.mergeCountryStats(resolvedBackendId, dbCountryStats)
        : dbCountryStats
      : undefined;

    const dbDeviceStats = wantsFullSummary
      ? (baseCacheValid ? baseCached!.deviceStats : this.db.getDevices(resolvedBackendId, 50, range.start, range.end))
      : undefined;
    const deviceStats = wantsFullSummary && dbDeviceStats
      ? includeRealtime
        ? realtimeStore.mergeDeviceStats(resolvedBackendId, dbDeviceStats, 50)
        : dbDeviceStats
      : undefined;

    const dbRuleStats = wantsFullSummary
      ? (baseCacheValid ? baseCached!.ruleStats : this.db.getRuleStats(resolvedBackendId, range.start, range.end))
      : undefined;
    const ruleStats = wantsFullSummary && dbRuleStats
      ? includeRealtime
        ? realtimeStore.mergeRuleStats(resolvedBackendId, dbRuleStats)
        : dbRuleStats
      : undefined;
    const hourlyStats = wantsFullSummary
      ? (baseCacheValid ? baseCached!.hourlyStats : this.db.getHourlyStats(resolvedBackendId, 24, range.start, range.end))
      : [];

    // Update base summary cache for future broadcasts
    if (wantsFullSummary && !baseCacheValid) {
      this.baseSummaryCache.set(baseCacheKey, {
        summary,
        topDomains: dbTopDomains!,
        topIPs: dbTopIPs!,
        proxyStats: dbProxyStats!,
        countryStats: dbCountryStats!,
        deviceStats: dbDeviceStats!,
        ruleStats: dbRuleStats!,
        hourlyStats,
        ts: Date.now(),
      });
      // Evict stale entries
      for (const [key, val] of this.baseSummaryCache) {
        if (Date.now() - val.ts > cacheTTL * 2) {
          this.baseSummaryCache.delete(key);
        }
      }
    }

    const trendStats = trend
      ? this.db.getTrafficTrendAggregated(
          resolvedBackendId,
          trend.minutes,
          trend.bucketMinutes,
          range.start,
          range.end,
        )
      : undefined;
    const dbDeviceDomains = deviceDetail
      ? this.db.getDeviceDomains(
          resolvedBackendId,
          deviceDetail.sourceIP,
          deviceDetail.limit,
          range.start,
          range.end,
        )
      : undefined;
    const dbDeviceIPs = deviceDetail
      ? this.db.getDeviceIPs(
          resolvedBackendId,
          deviceDetail.sourceIP,
          deviceDetail.limit,
          range.start,
          range.end,
        )
      : undefined;
    const deviceDomains = deviceDetail && dbDeviceDomains
      ? includeRealtime
        ? realtimeStore.mergeDeviceDomains(
            resolvedBackendId,
            deviceDetail.sourceIP,
            dbDeviceDomains,
            deviceDetail.limit,
          )
        : dbDeviceDomains
      : undefined;
    const deviceIPs = deviceDetail && dbDeviceIPs
      ? includeRealtime
        ? realtimeStore.mergeDeviceIPs(
            resolvedBackendId,
            deviceDetail.sourceIP,
            dbDeviceIPs,
            deviceDetail.limit,
          )
        : dbDeviceIPs
      : undefined;
    const dbProxyDomains = proxyDetail
      ? this.db.getProxyDomains(
          resolvedBackendId,
          proxyDetail.chain,
          proxyDetail.limit,
          range.start,
          range.end,
        )
      : undefined;
    const dbProxyIPs = proxyDetail
      ? this.db.getProxyIPs(
          resolvedBackendId,
          proxyDetail.chain,
          proxyDetail.limit,
          range.start,
          range.end,
        )
      : undefined;
    const proxyDomains = proxyDetail && dbProxyDomains
      ? includeRealtime
        ? realtimeStore.mergeProxyDomains(
            resolvedBackendId,
            proxyDetail.chain,
            dbProxyDomains,
            proxyDetail.limit,
          )
        : dbProxyDomains
      : undefined;
    const proxyIPs = proxyDetail && dbProxyIPs
      ? includeRealtime
        ? realtimeStore.mergeProxyIPs(
            resolvedBackendId,
            proxyDetail.chain,
            dbProxyIPs,
            proxyDetail.limit,
          )
        : dbProxyIPs
      : undefined;
    const dbRuleDomains = ruleDetail
      ? this.db.getRuleDomains(
          resolvedBackendId,
          ruleDetail.rule,
          ruleDetail.limit,
          range.start,
          range.end,
        )
      : undefined;
    const dbRuleIPs = ruleDetail
      ? this.db.getRuleIPs(
          resolvedBackendId,
          ruleDetail.rule,
          ruleDetail.limit,
          range.start,
          range.end,
        )
      : undefined;
    const ruleDomains = ruleDetail && dbRuleDomains
      ? includeRealtime
        ? realtimeStore.mergeRuleDomains(
            resolvedBackendId,
            ruleDetail.rule,
            dbRuleDomains,
            ruleDetail.limit,
          )
        : dbRuleDomains
      : undefined;
    const ruleIPs = ruleDetail && dbRuleIPs
      ? includeRealtime
        ? realtimeStore.mergeRuleIPs(
            resolvedBackendId,
            ruleDetail.rule,
            dbRuleIPs,
            ruleDetail.limit,
          )
        : dbRuleIPs
      : undefined;
    const ruleChainFlowAll = includeRuleChainFlow
      ? this.db.getAllRuleChainFlows(
          resolvedBackendId,
          range.start,
          range.end,
        )
      : undefined;
    const dbDomainsPage = domainsPage
      ? this.db.getDomainStatsPaginated(resolvedBackendId, {
          offset: domainsPage.offset,
          limit: domainsPage.limit,
          sortBy: domainsPage.sortBy,
          sortOrder: domainsPage.sortOrder,
          search: domainsPage.search,
          start: range.start,
          end: range.end,
        })
      : undefined;
    const domainsPageData = domainsPage && dbDomainsPage
      ? includeRealtime
        ? realtimeStore.mergeDomainStatsPaginated(resolvedBackendId, dbDomainsPage, domainsPage)
        : dbDomainsPage
      : undefined;
    const dbIPsPage = ipsPage
      ? this.db.getIPStatsPaginated(resolvedBackendId, {
          offset: ipsPage.offset,
          limit: ipsPage.limit,
          sortBy: ipsPage.sortBy,
          sortOrder: ipsPage.sortOrder,
          search: ipsPage.search,
          start: range.start,
          end: range.end,
        })
      : undefined;
    const ipsPageData = ipsPage && dbIPsPage
      ? includeRealtime
        ? realtimeStore.mergeIPStatsPaginated(resolvedBackendId, dbIPsPage, ipsPage)
        : dbIPsPage
      : undefined;
    const mergedTrendStats = trend && trendStats && includeRealtime
      ? realtimeStore.mergeTrend(
          resolvedBackendId,
          trendStats,
          trend.minutes,
          trend.bucketMinutes,
        )
      : trendStats;

    const baseStats: StatsSummary = {
      totalUpload: summary.totalUpload,
      totalDownload: summary.totalDownload,
      totalConnections: summary.totalConnections,
      totalDomains: summary.uniqueDomains,
      totalIPs: summary.uniqueIPs,
      totalProxies: proxyStats.length,
      totalRules: ruleStats?.length,
      topDomains,
      topIPs,
      proxyStats,
      countryStats,
      deviceStats,
      deviceDetailSourceIP: deviceDetail?.sourceIP,
      deviceDomains,
      deviceIPs,
      proxyDetailChain: proxyDetail?.chain,
      proxyDomains,
      proxyIPs,
      ruleDetailName: ruleDetail?.rule,
      ruleDomains,
      ruleIPs,
      ruleChainFlowAll,
      domainsPage: domainsPageData,
      domainsPageQuery: domainsPage ? { ...domainsPage } : undefined,
      ipsPage: ipsPageData,
      ipsPageQuery: ipsPage ? { ...ipsPage } : undefined,
      trendStats: mergedTrendStats,
      ruleStats,
      hourlyStats,
    };

    return includeRealtime && wantsFullSummary
      ? realtimeStore.applySummaryDelta(resolvedBackendId, baseStats)
      : baseStats;
  }

  private sendStatsToClient(ws: WebSocket) {
    if (ws.readyState !== WebSocket.OPEN) return;

    const clientInfo = this.clients.get(ws);
    if (!clientInfo) return;

    try {
      const stats = this.getStatsForBackend(
        clientInfo.backendId,
        clientInfo.range,
        clientInfo.trend,
        clientInfo.deviceDetail,
        clientInfo.proxyDetail,
        clientInfo.ruleDetail,
        clientInfo.includeRuleChainFlow,
        clientInfo.domainsPage,
        clientInfo.ipsPage,
      );
      if (!stats) {
        return;
      }

      const message: WebSocketMessage = {
        type: 'stats',
        data: stats,
        timestamp: new Date().toISOString(),
      };
      // Pre-serialize to avoid repeated JSON.stringify if same payload is reused
      ws.send(JSON.stringify(message));
      clientInfo.lastSentAt = Date.now();
    } catch (err) {
      console.error('[WebSocket] Error sending stats:', err);
    }
  }

  // Broadcast stats snapshot to subscribed clients.
  broadcastStats(changedBackendId?: number, force = false) {
    const now = Date.now();

    if (!force && now - this.lastBroadcastTime < this.broadcastThrottleMs) {
      return;
    }
    this.lastBroadcastTime = now;

    if (this.clients.size === 0) return;

    this.wsMetrics.broadcastCalls += 1;

    let sentCount = 0;
    // Cache serialized JSON per unique query combo to avoid repeated JSON.stringify
    const jsonCache = new Map<string, string | null>();
    const ts = new Date().toISOString();

    for (const [ws, clientInfo] of this.clients) {
      try {
        if (ws.readyState !== WebSocket.OPEN) continue;

        if (!force && clientInfo.minPushIntervalMs > 0) {
          const elapsed = now - clientInfo.lastSentAt;
          if (elapsed < clientInfo.minPushIntervalMs) {
            continue;
          }
        }

        const resolvedBackendId = this.resolveBackendId(clientInfo.backendId);
        if (resolvedBackendId === null) continue;

        if (changedBackendId !== undefined && resolvedBackendId !== changedBackendId) {
          continue;
        }

        const trendKey = clientInfo.trend
          ? `${clientInfo.trend.minutes}|${clientInfo.trend.bucketMinutes}`
          : '';
        const deviceDetailKey = clientInfo.deviceDetail
          ? `${clientInfo.deviceDetail.sourceIP}|${clientInfo.deviceDetail.limit}`
          : '';
        const proxyDetailKey = clientInfo.proxyDetail
          ? `${clientInfo.proxyDetail.chain}|${clientInfo.proxyDetail.limit}`
          : '';
        const ruleDetailKey = clientInfo.ruleDetail
          ? `${clientInfo.ruleDetail.rule}|${clientInfo.ruleDetail.limit}`
          : '';
        const ruleChainFlowKey = clientInfo.includeRuleChainFlow ? '1' : '0';
        const domainsPageKey = clientInfo.domainsPage
          ? `${clientInfo.domainsPage.offset}|${clientInfo.domainsPage.limit}|${clientInfo.domainsPage.sortBy || ''}|${clientInfo.domainsPage.sortOrder || ''}|${clientInfo.domainsPage.search || ''}`
          : '';
        const ipsPageKey = clientInfo.ipsPage
          ? `${clientInfo.ipsPage.offset}|${clientInfo.ipsPage.limit}|${clientInfo.ipsPage.sortBy || ''}|${clientInfo.ipsPage.sortOrder || ''}|${clientInfo.ipsPage.search || ''}`
          : '';
        const cacheKey = `${resolvedBackendId}|${clientInfo.range.start || ''}|${clientInfo.range.end || ''}|${trendKey}|${deviceDetailKey}|${proxyDetailKey}|${ruleDetailKey}|${ruleChainFlowKey}|${domainsPageKey}|${ipsPageKey}`;
        if (!jsonCache.has(cacheKey)) {
          const stats = this.getStatsForBackend(
            resolvedBackendId,
            clientInfo.range,
            clientInfo.trend,
            clientInfo.deviceDetail,
            clientInfo.proxyDetail,
            clientInfo.ruleDetail,
            clientInfo.includeRuleChainFlow,
            clientInfo.domainsPage,
            clientInfo.ipsPage,
          );
          // Serialize once per unique query; reuse for all clients with same params
          jsonCache.set(
            cacheKey,
            stats ? JSON.stringify({ type: 'stats', data: stats, timestamp: ts }) : null,
          );
        }

        const json = jsonCache.get(cacheKey);
        if (!json) continue;

        ws.send(json);
        clientInfo.lastSentAt = now;
        sentCount++;
      } catch (err) {
        console.error('[WebSocket] Error sending to client:', err);
      }
    }

    if (sentCount > 0) {
      this.wsMetrics.broadcastSentClients += sentCount;
      this.maybeLogWsMetrics();
      console.log(`[WebSocket] Broadcasted stats to ${sentCount} clients`);
    }
  }

  private maybeLogWsMetrics(): void {
    if (this.wsMetricsLogIntervalMs <= 0) {
      return;
    }
    const now = Date.now();
    const elapsedMs = now - this.wsMetricsWindowStartedAt;
    if (elapsedMs < this.wsMetricsLogIntervalMs) {
      return;
    }

    const elapsedSec = Math.max(1, elapsedMs / 1000);
    const getStatsQps = this.wsMetrics.getStatsCalls / elapsedSec;
    const subscribeQps = this.wsMetrics.subscribeTotal / elapsedSec;
    const cacheTotal = this.wsMetrics.baseCacheHit + this.wsMetrics.baseCacheMiss;
    const cacheHitRate = cacheTotal > 0
      ? (this.wsMetrics.baseCacheHit / cacheTotal) * 100
      : 0;

    console.info(
      `[WebSocket Metrics] subscribe_total=${this.wsMetrics.subscribeTotal} subscribe_changed=${this.wsMetrics.subscribeChanged} subscribe_noop=${this.wsMetrics.subscribeNoop} subscribe_qps=${subscribeQps.toFixed(2)} get_stats_calls=${this.wsMetrics.getStatsCalls} get_stats_qps=${getStatsQps.toFixed(2)} full_summary_calls=${this.wsMetrics.fullSummaryCalls} base_cache_hit=${this.wsMetrics.baseCacheHit} base_cache_miss=${this.wsMetrics.baseCacheMiss} base_cache_hit_rate=${cacheHitRate.toFixed(1)}% trend_calls=${this.wsMetrics.trendCalls} detail_calls=${this.wsMetrics.detailCalls} paged_calls=${this.wsMetrics.pagedCalls} broadcast_calls=${this.wsMetrics.broadcastCalls} broadcast_sent_clients=${this.wsMetrics.broadcastSentClients} window_sec=${elapsedSec.toFixed(1)}`,
    );

    this.wsMetricsWindowStartedAt = now;
    this.wsMetrics = {
      subscribeTotal: 0,
      subscribeChanged: 0,
      subscribeNoop: 0,
      getStatsCalls: 0,
      fullSummaryCalls: 0,
      baseCacheHit: 0,
      baseCacheMiss: 0,
      trendCalls: 0,
      detailCalls: 0,
      pagedCalls: 0,
      broadcastCalls: 0,
      broadcastSentClients: 0,
    };
  }

  getClientCount(): number {
    return this.clients.size;
  }

  clearBackendCache(backendId: number): void {
    const cachePrefix = `${backendId}|`;
    for (const key of this.baseSummaryCache.keys()) {
      if (key.startsWith(cachePrefix)) {
        this.baseSummaryCache.delete(key);
      }
    }
  }

  stop() {
    this.clients.forEach((info) => info.ws.close());
    this.clients.clear();
    this.wss?.close();
    console.log('[WebSocket] Server stopped');
  }
}
