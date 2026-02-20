import {
  SummaryDelta,
  MinuteBucket,
  DomainDelta,
  IPDelta,
  ProxyDelta,
  DeviceDelta,
  RuleDelta,
  CountryDelta,
  TrafficMeta,
} from './realtime.types.js';

export class RealtimeStore {
  // Expose these as public readonly or via getters if needed by the merger, 
  // but for now we'll make them public to allow the merger to access them easily.
  // In a stricter design, we might use getters.
  public summaryByBackend = new Map<number, SummaryDelta>();
  public minuteByBackend = new Map<number, Map<string, MinuteBucket>>();
  public domainByBackend = new Map<number, Map<string, DomainDelta>>();
  public ipByBackend = new Map<number, Map<string, IPDelta>>();
  public proxyByBackend = new Map<number, Map<string, ProxyDelta>>();
  public deviceByBackend = new Map<number, Map<string, DeviceDelta>>();
  public deviceDomainByBackend = new Map<number, Map<string, Map<string, DomainDelta>>>();
  public deviceIPByBackend = new Map<number, Map<string, Map<string, IPDelta>>>();
  public ruleByBackend = new Map<number, Map<string, RuleDelta>>();
  public ruleChainByBackend = new Map<number, Map<string, { rule: string; chain: string; totalUpload: number; totalDownload: number; totalConnections: number; lastSeen: string }>>();
  public countryByBackend = new Map<number, Map<string, CountryDelta>>();
  
  private maxMinutes: number;

  constructor(maxMinutes = parseInt(process.env.REALTIME_MAX_MINUTES || '180', 10)) {
    this.maxMinutes = Number.isFinite(maxMinutes) ? Math.max(30, maxMinutes) : 180;
  }

  /**
   * Helper to generate minute key "YYYY-MM-DDTHH:mm:00"
   */
  private toMinuteKey(tsMs: number): string {
    const iso = new Date(tsMs).toISOString();
    return `${iso.slice(0, 16)}:00`;
  }

  private pruneOldBuckets(minuteMap: Map<string, MinuteBucket>, nowMs: number) {
    // Simple pruning strategy: remove keys older than maxMinutes
    // This is less efficient than a rolling buffer but easier to implement with Map
    const cutoff = new Date(nowMs - this.maxMinutes * 60 * 1000).toISOString().slice(0, 16) + ':00';
    for (const key of minuteMap.keys()) {
      if (key < cutoff) {
        minuteMap.delete(key);
      }
    }
  }

  recordTraffic(
    backendId: number,
    meta: TrafficMeta,
    connections = 1,
    timestamp = Date.now()
  ): void {
    if (meta.upload <= 0 && meta.download <= 0) return;

    // 1. Summary
    const summary = this.summaryByBackend.get(backendId) || {
      upload: 0,
      download: 0,
      connections: 0,
      lastUpdated: 0,
    };
    summary.upload += meta.upload;
    summary.download += meta.download;
    summary.connections += connections;
    summary.lastUpdated = timestamp;
    this.summaryByBackend.set(backendId, summary);

    // 2. Minute Bucket
    const minuteKey = this.toMinuteKey(timestamp);
    let minuteMap = this.minuteByBackend.get(backendId);
    if (!minuteMap) {
      minuteMap = new Map();
      this.minuteByBackend.set(backendId, minuteMap);
    }
    const bucket = minuteMap.get(minuteKey) || { upload: 0, download: 0, lastUpdated: 0 };
    bucket.upload += meta.upload;
    bucket.download += meta.download;
    bucket.lastUpdated = timestamp;
    minuteMap.set(minuteKey, bucket);

    this.pruneOldBuckets(minuteMap, timestamp);

    const ruleName =
      meta.chains.length > 1
        ? meta.chains[meta.chains.length - 1]
        : meta.rulePayload
          ? `${meta.rule}(${meta.rulePayload})`
          : meta.rule;
    const fullChain = meta.chains.join(' > ');
    const lastSeen = new Date(timestamp).toISOString();

    // 3. Domain
    if (meta.domain) {
      let domainMap = this.domainByBackend.get(backendId);
      if (!domainMap) {
        domainMap = new Map();
        this.domainByBackend.set(backendId, domainMap);
      }

      const domainDelta = domainMap.get(meta.domain) || {
        domain: meta.domain,
        totalUpload: 0,
        totalDownload: 0,
        totalConnections: 0,
        lastSeen,
        ips: new Set<string>(),
        rules: new Set<string>(),
        chains: new Set<string>(),
      };

      domainDelta.totalUpload += meta.upload;
      domainDelta.totalDownload += meta.download;
      domainDelta.totalConnections += connections;
      domainDelta.lastSeen = lastSeen;
      if (meta.ip) domainDelta.ips.add(meta.ip);
      if (ruleName) domainDelta.rules.add(ruleName);
      if (fullChain) domainDelta.chains.add(fullChain);
      domainMap.set(meta.domain, domainDelta);
    }

    // 4. IP
    if (meta.ip) {
      let ipMap = this.ipByBackend.get(backendId);
      if (!ipMap) {
        ipMap = new Map();
        this.ipByBackend.set(backendId, ipMap);
      }

      const ipDelta = ipMap.get(meta.ip) || {
        ip: meta.ip,
        totalUpload: 0,
        totalDownload: 0,
        totalConnections: 0,
        lastSeen,
        domains: new Set<string>(),
        chains: new Set<string>(),
        rules: new Set<string>(),
      };

      ipDelta.totalUpload += meta.upload;
      ipDelta.totalDownload += meta.download;
      ipDelta.totalConnections += connections;
      ipDelta.lastSeen = lastSeen;
      const ipDomain = meta.domain || 'unknown';
      if (ipDomain) ipDelta.domains.add(ipDomain);
      if (fullChain) ipDelta.chains.add(fullChain);
      if (ruleName) ipDelta.rules.add(ruleName);
      ipMap.set(meta.ip, ipDelta);
    }

    // 5. Proxy
    const proxyChain = meta.chains[0] || 'DIRECT';
    let proxyMap = this.proxyByBackend.get(backendId);
    if (!proxyMap) {
      proxyMap = new Map();
      this.proxyByBackend.set(backendId, proxyMap);
    }

    const proxyDelta = proxyMap.get(proxyChain) || {
      chain: proxyChain,
      totalUpload: 0,
      totalDownload: 0,
      totalConnections: 0,
      lastSeen,
    };

    proxyDelta.totalUpload += meta.upload;
    proxyDelta.totalDownload += meta.download;
    proxyDelta.totalConnections += connections;
    proxyDelta.lastSeen = lastSeen;
    proxyMap.set(proxyChain, proxyDelta);

    // 6. Device (Source IP)
    const sourceIP = (meta.sourceIP || '').trim();
    if (sourceIP) {
      let deviceMap = this.deviceByBackend.get(backendId);
      if (!deviceMap) {
        deviceMap = new Map();
        this.deviceByBackend.set(backendId, deviceMap);
      }

      const deviceDelta = deviceMap.get(sourceIP) || {
        sourceIP,
        totalUpload: 0,
        totalDownload: 0,
        totalConnections: 0,
        lastSeen,
      };
      deviceDelta.totalUpload += meta.upload;
      deviceDelta.totalDownload += meta.download;
      deviceDelta.totalConnections += connections;
      deviceDelta.lastSeen = lastSeen;
      deviceMap.set(sourceIP, deviceDelta);

      // Device -> Domain
      if (meta.domain) {
        let sourceDomainMap = this.deviceDomainByBackend.get(backendId);
        if (!sourceDomainMap) {
          sourceDomainMap = new Map();
          this.deviceDomainByBackend.set(backendId, sourceDomainMap);
        }
        let domainMap = sourceDomainMap.get(sourceIP);
        if (!domainMap) {
          domainMap = new Map();
          sourceDomainMap.set(sourceIP, domainMap);
        }

        const domainDelta = domainMap.get(meta.domain) || {
          domain: meta.domain,
          totalUpload: 0,
          totalDownload: 0,
          totalConnections: 0,
          lastSeen,
          ips: new Set<string>(),
          rules: new Set<string>(),
          chains: new Set<string>(),
        };
        domainDelta.totalUpload += meta.upload;
        domainDelta.totalDownload += meta.download;
        domainDelta.totalConnections += connections;
        domainDelta.lastSeen = lastSeen;
        if (meta.ip) domainDelta.ips.add(meta.ip);
        if (ruleName) domainDelta.rules.add(ruleName);
        if (fullChain) domainDelta.chains.add(fullChain);
        domainMap.set(meta.domain, domainDelta);
      }

      // Device -> IP
      if (meta.ip) {
        let sourceIPMap = this.deviceIPByBackend.get(backendId);
        if (!sourceIPMap) {
          sourceIPMap = new Map();
          this.deviceIPByBackend.set(backendId, sourceIPMap);
        }
        let ipMap = sourceIPMap.get(sourceIP);
        if (!ipMap) {
          ipMap = new Map();
          sourceIPMap.set(sourceIP, ipMap);
        }

        const ipDelta = ipMap.get(meta.ip) || {
          ip: meta.ip,
          totalUpload: 0,
          totalDownload: 0,
          totalConnections: 0,
          lastSeen,
          domains: new Set<string>(),
          chains: new Set<string>(),
          rules: new Set<string>(),
        };
        ipDelta.totalUpload += meta.upload;
        ipDelta.totalDownload += meta.download;
        ipDelta.totalConnections += connections;
        ipDelta.lastSeen = lastSeen;
        if (meta.domain) ipDelta.domains.add(meta.domain);
        if (fullChain) ipDelta.chains.add(fullChain);
        if (ruleName) ipDelta.rules.add(ruleName);
        ipMap.set(meta.ip, ipDelta);
      }
    }

    // 7. Rule
    let ruleMap = this.ruleByBackend.get(backendId);
    if (!ruleMap) {
      ruleMap = new Map();
      this.ruleByBackend.set(backendId, ruleMap);
    }

    const finalProxy = proxyChain || 'DIRECT';
    const ruleDelta = ruleMap.get(ruleName) || {
      rule: ruleName,
      finalProxy,
      totalUpload: 0,
      totalDownload: 0,
      totalConnections: 0,
      lastSeen,
    };
    ruleDelta.finalProxy = finalProxy;
    ruleDelta.totalUpload += meta.upload;
    ruleDelta.totalDownload += meta.download;
    ruleDelta.totalConnections += connections;
    ruleDelta.lastSeen = lastSeen;
    ruleMap.set(ruleName, ruleDelta);

    // 8. Rule Chain
    if (ruleName && fullChain) {
      let ruleChainMap = this.ruleChainByBackend.get(backendId);
      if (!ruleChainMap) {
        ruleChainMap = new Map();
        this.ruleChainByBackend.set(backendId, ruleChainMap);
      }
      
      const rcKey = `${ruleName}::${fullChain}`;
      const rcDelta = ruleChainMap.get(rcKey) || {
        rule: ruleName,
        chain: fullChain,
        totalUpload: 0,
        totalDownload: 0,
        totalConnections: 0,
        lastSeen,
      };
      rcDelta.totalUpload += meta.upload;
      rcDelta.totalDownload += meta.download;
      rcDelta.totalConnections += connections;
      rcDelta.lastSeen = lastSeen;
      ruleChainMap.set(rcKey, rcDelta);
    }
  }

  recordCountryTraffic(
    backendId: number,
    geo: { country: string; country_name: string; continent: string },
    upload: number,
    download: number,
    connections = 1,
    timestamp = Date.now(),
  ): void {
    if (upload <= 0 && download <= 0) return;

    const lastSeen = new Date(timestamp).toISOString();
    let countryMap = this.countryByBackend.get(backendId);
    if (!countryMap) {
      countryMap = new Map();
      this.countryByBackend.set(backendId, countryMap);
    }

    const key = geo.country || 'Unknown';
    const countryDelta = countryMap.get(key) || {
      country: key,
      countryName: geo.country_name || geo.country || 'Unknown',
      continent: geo.continent || 'Unknown',
      totalUpload: 0,
      totalDownload: 0,
      totalConnections: 0,
      lastSeen,
    };

    countryDelta.totalUpload += upload;
    countryDelta.totalDownload += download;
    countryDelta.totalConnections += connections;
    countryDelta.lastSeen = lastSeen;
    countryMap.set(key, countryDelta);
  }

  getRuleChainRows(backendId: number): Array<{ rule: string; chain: string; totalUpload: number; totalDownload: number; totalConnections: number }> {
    const ruleChainMap = this.ruleChainByBackend.get(backendId);
    if (!ruleChainMap) return [];
    return Array.from(ruleChainMap.values()).map(r => ({ ...r }));
  }

  getSummaryDelta(backendId: number): SummaryDelta {
    return this.summaryByBackend.get(backendId) || {
      upload: 0,
      download: 0,
      connections: 0,
      lastUpdated: 0,
    };
  }

  getTodayDelta(backendId: number, nowMs = Date.now()): { upload: number; download: number } {
    const minuteMap = this.minuteByBackend.get(backendId);
    if (!minuteMap || minuteMap.size === 0) return { upload: 0, download: 0 };

    const todayPrefix = new Date(nowMs).toISOString().slice(0, 10);
    let upload = 0;
    let download = 0;

    for (const [minuteKey, bucket] of minuteMap) {
      if (minuteKey.startsWith(todayPrefix)) {
        upload += bucket.upload;
        download += bucket.download;
      }
    }

    return { upload, download };
  }
}
