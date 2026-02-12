// Gateway Connection Metadata
export interface ConnectionMetadata {
  network: string;
  type: string;
  sourceIP: string;
  destinationIP: string;
  sourceGeoIP: string[] | null;
  destinationGeoIP: string[] | null;
  sourceIPASN: string;
  destinationIPASN: string;
  sourcePort: string;
  destinationPort: string;
  inboundIP: string;
  inboundPort: string;
  inboundName: string;
  inboundUser: string;
  host: string;
  dnsMode: string;
  uid: number;
  process: string;
  processPath: string;
  specialProxy: string;
  specialRules: string;
  remoteDestination: string;
  dscp: number;
  sniffHost: string;
}

export interface Connection {
  id: string;
  metadata: ConnectionMetadata;
  upload: number;
  download: number;
  start: string;
  chains: string[];
  providerChains: string[];
  rule: string;
  rulePayload: string;
}

export interface ConnectionsData {
  downloadTotal: number;
  uploadTotal: number;
  connections: Connection[];
  memory?: number;
}

// Aggregated Statistics
export interface DomainStats {
  domain: string;
  ips: string[];
  totalUpload: number;
  totalDownload: number;
  totalConnections: number;
  lastSeen: string;
  rules: string[];
  chains: string[];
}

export interface IPStats {
  ip: string;
  domains: string[];
  totalUpload: number;
  totalDownload: number;
  totalConnections: number;
  lastSeen: string;
  asn?: string;
  geoIP?: string[];
  chains?: string[];
}

export interface HourlyStats {
  hour: string;
  upload: number;
  download: number;
  connections: number;
}

export interface TrafficTrendPoint {
  time: string;
  upload: number;
  download: number;
}

export interface DailyStats {
  date: string;
  upload: number;
  download: number;
  connections: number;
}

export interface ProxyStats {
  chain: string;
  totalUpload: number;
  totalDownload: number;
  totalConnections: number;
  lastSeen: string;
}

export interface DeviceStats {
  sourceIP: string;
  totalUpload: number;
  totalDownload: number;
  totalConnections: number;
  lastSeen: string;
}

export interface RuleStats {
  rule: string;
  finalProxy: string;
  totalUpload: number;
  totalDownload: number;
  totalConnections: number;
  lastSeen: string;
}

export interface RuleProxyMapping {
  rule: string;
  proxy: string;
  totalUpload: number;
  totalDownload: number;
  totalConnections: number;
}

export interface CountryStats {
  country: string;
  countryName: string;
  continent: string;
  totalUpload: number;
  totalDownload: number;
  totalConnections: number;
  lastSeen?: string;
}

// Per-proxy traffic breakdown for a specific domain or IP
export interface ProxyTrafficStats {
  chain: string;
  totalUpload: number;
  totalDownload: number;
  totalConnections: number;
}

export interface RuleChainFlowAll {
  nodes: Array<{
    name: string;
    layer: number;
    nodeType: "rule" | "group" | "proxy";
    totalUpload: number;
    totalDownload: number;
    totalConnections: number;
    rules: string[];
  }>;
  links: Array<{
    source: number;
    target: number;
    rules: string[];
  }>;
  rulePaths: Record<string, { nodeIndices: number[]; linkIndices: number[] }>;
  maxLayer: number;
}

// API Response Types
export interface StatsSummary {
  totalUpload: number;
  totalDownload: number;
  totalConnections: number;
  totalDomains: number;
  totalIPs: number;
  totalProxies: number;
  totalRules?: number;
  todayUpload?: number;
  todayDownload?: number;
  activeConnections?: number;
  topDomains: DomainStats[];
  topIPs: IPStats[];
  proxyStats: ProxyStats[];
  countryStats?: CountryStats[];
  deviceStats?: DeviceStats[];
  deviceDetailSourceIP?: string;
  deviceDomains?: DomainStats[];
  deviceIPs?: IPStats[];
  proxyDetailChain?: string;
  proxyDomains?: DomainStats[];
  proxyIPs?: IPStats[];
  ruleDetailName?: string;
  ruleDomains?: DomainStats[];
  ruleIPs?: IPStats[];
  ruleChainFlowAll?: RuleChainFlowAll;
  domainsPage?: { data: DomainStats[]; total: number };
  domainsPageQuery?: {
    offset: number;
    limit: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    search?: string;
  };
  ipsPage?: { data: IPStats[]; total: number };
  ipsPageQuery?: {
    offset: number;
    limit: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    search?: string;
  };
  trendStats?: TrafficTrendPoint[];
  ruleStats?: RuleStats[];
  hourlyStats: HourlyStats[];
}

export interface TimeRangeQuery {
  start?: string;
  end?: string;
  limit?: number;
}

// WebSocket Events
export interface StatsUpdateEvent {
  type: 'stats_update';
  data: ConnectionsData;
  timestamp: string;
}

export interface AggregatedUpdateEvent {
  type: 'aggregated_update';
  domains: DomainStats[];
  totalStats: {
    upload: number;
    download: number;
  };
  timestamp: string;
}

export type WebSocketEvent = StatsUpdateEvent | AggregatedUpdateEvent;

export interface AuthState {
  enabled: boolean;
  hasToken: boolean;
  forceAccessControlOff?: boolean;
  showcaseMode?: boolean;
}
