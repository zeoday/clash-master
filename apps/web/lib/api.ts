import type {
  StatsSummary,
  DomainStats,
  IPStats,
  ProxyStats,
  RuleStats,
  CountryStats,
  HourlyStats,
  DailyStats,
  TrafficTrendPoint,
  ProxyTrafficStats,
} from "@clashmaster/shared";

const API_BASE = "/api";

async function fetchJson<T>(url: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', body?: any): Promise<T> {
  const options: RequestInit = {
    method,
    headers: {},
  };
  
  // Only set Content-Type when there's a body
  if (body && method !== 'GET') {
    options.headers = {
      'Content-Type': 'application/json',
    };
    options.body = JSON.stringify(body);
  }
  
  console.log(`[API] ${method} ${url}`);
  const res = await fetch(url, options);
  if (!res.ok) {
    console.error(`[API] Error ${res.status}: ${url}`);
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
}

export interface TimeRange {
  start: string;
  end: string;
}

export interface Backend {
  id: number;
  name: string;
  url: string;
  token: string;
  enabled: boolean;
  is_active: boolean;
  listening: boolean;
  hasToken?: boolean;
  created_at: string;
  updated_at: string;
}

function buildUrl(base: string, params: Record<string, string | number | undefined>): string {
  // Use simple URL construction for client-side relative URLs
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      searchParams.set(key, String(value));
    }
  });
  const query = searchParams.toString();
  return query ? `${base}?${query}` : base;
}

export const api = {
  // Stats APIs with optional backendId parameter
  getSummary: (backendId?: number, range?: TimeRange) => 
    fetchJson<StatsSummary & { backend: { id: number; name: string; isActive: boolean; listening: boolean } }>(
      buildUrl(`${API_BASE}/stats/summary`, {
        backendId,
        start: range?.start,
        end: range?.end,
      })
    ),
  
  getGlobalSummary: () =>
    fetchJson<{
      totalConnections: number;
      totalUpload: number;
      totalDownload: number;
      uniqueDomains: number;
      uniqueIPs: number;
      backendCount: number;
    }>(`${API_BASE}/stats/global`),
    
  getDomains: (backendId?: number, limit = 50, range?: TimeRange) =>
    fetchJson<DomainStats[]>(buildUrl(`${API_BASE}/stats/domains`, {
      backendId,
      limit,
      start: range?.start,
      end: range?.end,
    })),
    
  getIPs: (backendId?: number, limit = 50, range?: TimeRange) =>
    fetchJson<IPStats[]>(buildUrl(`${API_BASE}/stats/ips`, {
      backendId,
      limit,
      start: range?.start,
      end: range?.end,
    })),
    
  getProxies: (backendId?: number, limit = 50, range?: TimeRange) =>
    fetchJson<ProxyStats[]>(buildUrl(`${API_BASE}/stats/proxies`, {
      backendId,
      limit,
      start: range?.start,
      end: range?.end,
    })),
    
  getRules: (backendId?: number, limit = 50, range?: TimeRange) =>
    fetchJson<RuleStats[]>(buildUrl(`${API_BASE}/stats/rules`, {
      backendId,
      limit,
      start: range?.start,
      end: range?.end,
    })),
    
  getCountries: (backendId?: number, limit = 50, range?: TimeRange) =>
    fetchJson<CountryStats[]>(buildUrl(`${API_BASE}/stats/countries`, {
      backendId,
      limit,
      start: range?.start,
      end: range?.end,
    })),
    
  getRuleProxies: (backendId?: number) =>
    fetchJson<{ rule: string; proxies: string[] }[]>(
      buildUrl(`${API_BASE}/stats/rule-proxy-map`, { backendId })
    ),
    
  getHourly: (backendId?: number, hours = 24, range?: TimeRange) =>
    fetchJson<HourlyStats[]>(buildUrl(`${API_BASE}/stats/hourly`, {
      backendId,
      hours,
      start: range?.start,
      end: range?.end,
    })),
    
  getDaily: (backendId?: number, days = 7) =>
    fetchJson<DailyStats[]>(buildUrl(`${API_BASE}/stats/daily`, { backendId, days })),
    
  getTrafficTrend: (backendId?: number, minutes = 30) =>
    fetchJson<TrafficTrendPoint[]>(buildUrl(`${API_BASE}/stats/trend`, {
      backendId,
      minutes,
    })),

  getTrafficTrendAggregated: (backendId?: number, minutes = 30, bucketMinutes = 1) =>
    fetchJson<TrafficTrendPoint[]>(
      buildUrl(`${API_BASE}/stats/trend/aggregated`, {
        backendId,
        minutes,
        bucketMinutes,
      })
    ),
    
  getConnections: (backendId?: number, limit = 100) =>
    fetchJson<Array<{ id: number; domain: string; ip: string; chain: string; upload: number; download: number; timestamp: string }>>(
      buildUrl(`${API_BASE}/stats/connections`, { backendId, limit })
    ),
    
  getDomainProxyStats: (domain: string, backendId?: number) =>
    fetchJson<ProxyTrafficStats[]>(
      buildUrl(`${API_BASE}/stats/domains/proxy-stats`, { domain, backendId })
    ),

  getDomainIPDetails: (domain: string, backendId?: number) =>
    fetchJson<IPStats[]>(
      buildUrl(`${API_BASE}/stats/domains/ip-details`, { domain, backendId })
    ),

  getIPProxyStats: (ip: string, backendId?: number) =>
    fetchJson<ProxyTrafficStats[]>(
      buildUrl(`${API_BASE}/stats/ips/proxy-stats`, { ip, backendId })
    ),

  getProxyDomains: (chain: string, backendId?: number) =>
    fetchJson<DomainStats[]>(
      buildUrl(`${API_BASE}/stats/proxies/domains`, { chain, backendId })
    ),

  getProxyIPs: (chain: string, backendId?: number) =>
    fetchJson<IPStats[]>(
      buildUrl(`${API_BASE}/stats/proxies/ips`, { chain, backendId })
    ),

  search: (q: string) =>
    fetchJson<DomainStats[]>(
      `${API_BASE}/search?q=${encodeURIComponent(q)}`
    ),
    
  // Backend management
  getBackends: () =>
    fetchJson<Backend[]>(`${API_BASE}/backends`),
    
  getActiveBackend: () =>
    fetchJson<Backend | { error: string }>(`${API_BASE}/backends/active`),

  getListeningBackends: () =>
    fetchJson<Backend[]>(`${API_BASE}/backends/listening`),
    
  createBackend: (backend: { name: string; url: string; token?: string }) =>
    fetchJson<{ id: number; isActive?: boolean; message: string }>(`${API_BASE}/backends`, 'POST', backend),
    
  updateBackend: (id: number, backend: { name?: string; url?: string; token?: string; enabled?: boolean; listening?: boolean }) =>
    fetchJson<{ message: string }>(`${API_BASE}/backends/${id}`, 'PUT', backend),
    
  deleteBackend: (id: number) =>
    fetchJson<{ message: string }>(`${API_BASE}/backends/${id}`, 'DELETE'),
    
  setActiveBackend: (id: number) =>
    fetchJson<{ message: string }>(`${API_BASE}/backends/${id}/activate`, 'POST'),

  setBackendListening: (id: number, listening: boolean) =>
    fetchJson<{ message: string }>(`${API_BASE}/backends/${id}/listening`, 'POST', { listening }),

  clearBackendData: (id: number) =>
    fetchJson<{ message: string }>(`${API_BASE}/backends/${id}/clear-data`, 'POST'),
    
  testBackend: (url: string, token?: string) =>
    fetchJson<{ success: boolean; message: string }>(`${API_BASE}/backends/test`, 'POST', { url, token }),
    
  // Database management
  getDbStats: () =>
    fetchJson<{ size: number; totalConnectionsCount: number }>(`${API_BASE}/db/stats`),
    
  clearLogs: (days: number, backendId?: number) =>
    fetchJson<{ message: string; deleted: number }>(`${API_BASE}/db/cleanup`, 'POST', { days, backendId }),

  vacuumDatabase: () =>
    fetchJson<{ message: string }>(`${API_BASE}/db/vacuum`, 'POST'),

  getRetentionConfig: () =>
    fetchJson<{ connectionLogsDays: number; hourlyStatsDays: number; autoCleanup: boolean }>(`${API_BASE}/db/retention`),

  updateRetentionConfig: (config: { connectionLogsDays: number; hourlyStatsDays: number; autoCleanup?: boolean }) =>
    fetchJson<{ message: string }>(`${API_BASE}/db/retention`, 'PUT', config),
};

// Helper functions for time range
export function getPresetTimeRange(preset: '7d' | '30d' | '24h' | 'today'): TimeRange {
  const end = new Date();
  const start = new Date();
  
  switch (preset) {
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case '24h':
      start.setHours(start.getHours() - 24);
      break;
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
  }
  
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export function formatDateTimeForInput(date: Date): string {
  return date.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
}

export function formatDateTimeDisplay(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
