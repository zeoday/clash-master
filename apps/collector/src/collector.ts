"use client";

import WebSocket from 'ws';
import type { ConnectionsData } from '@clashmaster/shared';
import { StatsDatabase } from './db.js';
import { GeoIPService } from './geo-service.js';

interface CollectorOptions {
  url: string;
  token?: string;
  reconnectInterval?: number;
  onData?: (data: ConnectionsData) => void;
  onError?: (error: Error) => void;
}

interface TrafficUpdate {
  domain: string;
  ip: string;
  chain: string;
  chains: string[];
  upload: number;
  download: number;
}

interface GeoIPResult {
  ip: string;
  geo: {
    country: string;
    country_name: string;
    continent: string;
  } | null;
  upload: number;
  download: number;
}

export class OpenClashCollector {
  private ws: WebSocket | null = null;
  private url: string;
  private token?: string;
  private reconnectInterval: number;
  private onData?: (data: ConnectionsData) => void;
  private onError?: (error: Error) => void;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isClosing = false;
  private backendId: number;

  constructor(backendId: number, options: CollectorOptions) {
    this.backendId = backendId;
    this.url = options.url;
    this.token = options.token;
    this.reconnectInterval = options.reconnectInterval || 5000;
    this.onData = options.onData;
    this.onError = options.onError;
  }

  connect() {
    if (this.isClosing) return;

    console.log(`[Collector:${this.backendId}] Connecting to ${this.url}...`);

    const headers: Record<string, string> = {
      'Origin': this.url.replace('ws://', 'http://').replace('wss://', 'https://'),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    this.ws = new WebSocket(this.url, {
      headers,
      followRedirects: true,
    });

    this.ws.on('open', () => {
      console.log(`[Collector:${this.backendId}] WebSocket connected`);
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const json = JSON.parse(data.toString()) as ConnectionsData;
        this.onData?.(json);
      } catch (err) {
        console.error(`[Collector:${this.backendId}] Failed to parse message:`, err);
      }
    });

    this.ws.on('error', (err) => {
      console.error(`[Collector:${this.backendId}] WebSocket error:`, err.message);
      this.onError?.(err);
    });

    this.ws.on('close', (code, reason) => {
      console.log(`[Collector:${this.backendId}] WebSocket closed: ${code} ${reason}`);
      if (!this.isClosing) {
        this.scheduleReconnect();
      }
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    console.log(`[Collector:${this.backendId}] Reconnecting in ${this.reconnectInterval}ms...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectInterval);
  }

  disconnect() {
    this.isClosing = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    console.log(`[Collector:${this.backendId}] Disconnected`);
  }
}

// Batch buffer for traffic updates
class BatchBuffer {
  private buffer: Map<string, TrafficUpdate> = new Map();
  private geoQueue: GeoIPResult[] = [];
  private lastLogTime = 0;
  private logCounter = 0;
  
  add(backendId: number, update: TrafficUpdate) {
    const key = `${backendId}:${update.domain}:${update.ip}:${update.chain}`;
    const existing = this.buffer.get(key);
    
    if (existing) {
      existing.upload += update.upload;
      existing.download += update.download;
    } else {
      this.buffer.set(key, { ...update });
    }
  }
  
  addGeoResult(result: GeoIPResult) {
    this.geoQueue.push(result);
  }
  
  flush(db: StatsDatabase, geoService: GeoIPService | undefined, backendId: number): { domains: number; rules: number } {
    if (this.buffer.size === 0) {
      return { domains: 0, rules: 0 };
    }
    
    const updates = Array.from(this.buffer.values());
    this.buffer.clear();
    
    // Merge geo queue
    const geoResults = [...this.geoQueue];
    this.geoQueue = [];
    
    // Calculate unique domains and rules for logging
    const domains = new Set<string>();
    const rules = new Set<string>();
    
    for (const update of updates) {
      if (update.domain) domains.add(update.domain);
      const initialRule = update.chains.length > 0 ? update.chains[update.chains.length - 1] : 'DIRECT';
      rules.add(initialRule);
    }
    
    // Batch write to database
    try {
      db.batchUpdateTrafficStats(backendId, updates);
      
      // Process geo results
      for (const result of geoResults) {
        if (result.geo) {
          db.updateCountryStats(
            backendId,
            result.geo.country,
            result.geo.country_name,
            result.geo.continent,
            result.upload,
            result.download
          );
        }
      }
    } catch (err) {
      console.error(`[Collector:${backendId}] Batch write failed:`, err);
    }
    
    return { domains: domains.size, rules: rules.size };
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

// Track connection state with their accumulated traffic
interface TrackedConnection {
  id: string;
  domain: string;
  ip: string;
  chains: string[];
  lastUpload: number;
  lastDownload: number;
  totalUpload: number;
  totalDownload: number;
}

export function createCollector(
  db: StatsDatabase, 
  url: string, 
  token?: string,
  geoService?: GeoIPService,
  onTrafficUpdate?: () => void,
  backendId?: number // Backend ID for data isolation
) {
  const id = backendId || 0;
  const activeConnections = new Map<string, TrackedConnection>();
  const batchBuffer = new BatchBuffer();
  let lastBroadcastTime = 0;
  const broadcastThrottleMs = 500;
  let flushInterval: NodeJS.Timeout | null = null;
  
  // Start batch flush interval (every 1000ms)
  flushInterval = setInterval(() => {
    const stats = batchBuffer.flush(db, geoService, id);
    
    if (batchBuffer.shouldLog() && (stats.domains > 0 || stats.rules > 0)) {
      console.log(`[Collector:${id}] Active: ${activeConnections.size}, Domains: ${stats.domains}, Rules: ${stats.rules}`);
    }
  }, 1000);
  
  const collector = new OpenClashCollector(id, {
    url,
    token,
    onData: (data) => {
      // Validate data format - be more lenient
      if (!data) {
        console.warn(`[Collector:${id}] Received null/undefined data`);
        return;
      }
      
      // Some backends send empty messages or keepalive packets
      if (!data.connections) {
        // Silently ignore - this is normal for some backends
        return;
      }
      
      if (!Array.isArray(data.connections)) {
        console.warn(`[Collector:${id}] Invalid connections format: ${typeof data.connections}`);
        return;
      }
      
      const now = Date.now();
      const currentIds = new Set(data.connections.map(c => c?.id).filter(Boolean));
      let hasNewTraffic = false;
      
      // Process all current connections
      for (const conn of data.connections) {
        // Skip invalid connection entries - be more lenient
        if (!conn || typeof conn !== 'object') {
          continue;
        }
        
        // Some backends may not have all fields
        if (!conn.id) {
          continue;
        }
        
        // Ensure metadata exists with defaults
        const metadata = conn.metadata || {};
        const domain = metadata.host || metadata.sniffHost || '';
        const ip = metadata.destinationIP || '';
        const chains = Array.isArray(conn.chains) ? conn.chains : ['DIRECT'];
        
        const existing = activeConnections.get(conn.id);
        
        if (!existing) {
          // New connection - track it and record initial traffic
          activeConnections.set(conn.id, {
            id: conn.id,
            domain,
            ip,
            chains,
            lastUpload: conn.upload,
            lastDownload: conn.download,
            totalUpload: conn.upload,
            totalDownload: conn.download,
          });
          
          // Record initial traffic for new connection (add to batch buffer)
          if (conn.upload > 0 || conn.download > 0) {
            batchBuffer.add(id, {
              domain,
              ip,
              chain: chains[0] || 'DIRECT',
              chains,
              upload: conn.upload,
              download: conn.download,
            });

            // Queue GeoIP lookup
            if (geoService && ip) {
              geoService.getGeoLocation(ip).then((geo) => {
                if (geo) {
                  batchBuffer.addGeoResult({
                    ip,
                    geo,
                    upload: conn.upload,
                    download: conn.download,
                  });
                }
              }).catch(() => {
                // Silently fail for GeoIP errors
              });
            }
            
            hasNewTraffic = true;
          }
        } else {
          // Existing connection - calculate delta and add to batch
          const uploadDelta = Math.max(0, conn.upload - existing.lastUpload);
          const downloadDelta = Math.max(0, conn.download - existing.lastDownload);
          
          if (uploadDelta > 0 || downloadDelta > 0) {
            // Update accumulated traffic for this connection
            existing.totalUpload += uploadDelta;
            existing.totalDownload += downloadDelta;
            
            // Add delta to batch buffer
            batchBuffer.add(id, {
              domain: existing.domain,
              ip: existing.ip,
              chain: existing.chains[0] || 'DIRECT',
              chains: existing.chains,
              upload: uploadDelta,
              download: downloadDelta,
            });

            // Queue GeoIP lookup for delta
            if (geoService && existing.ip) {
              geoService.getGeoLocation(existing.ip).then((geo) => {
                if (geo) {
                  batchBuffer.addGeoResult({
                    ip: existing.ip,
                    geo,
                    upload: uploadDelta,
                    download: downloadDelta,
                  });
                }
              }).catch(() => {
                // Silently fail for GeoIP errors
              });
            }
            
            existing.lastUpload = conn.upload;
            existing.lastDownload = conn.download;
            hasNewTraffic = true;
          }
        }
      }
      
      // Find closed connections and remove them
      for (const [connId, tracked] of activeConnections) {
        if (!currentIds.has(connId)) {
          // Connection closed - any remaining traffic was already counted
          activeConnections.delete(connId);
        }
      }
      
      // Broadcast to WebSocket clients if there's new traffic (with throttling)
      if (hasNewTraffic && onTrafficUpdate && now - lastBroadcastTime > broadcastThrottleMs) {
        lastBroadcastTime = now;
        onTrafficUpdate();
      }
    },
    onError: (err) => {
      console.error(`[Collector:${id}] Error:`, err);
    }
  });
  
  // Override disconnect to clear interval
  const originalDisconnect = collector.disconnect.bind(collector);
  collector.disconnect = () => {
    if (flushInterval) {
      clearInterval(flushInterval);
      flushInterval = null;
      // Final flush
      batchBuffer.flush(db, geoService, id);
    }
    originalDisconnect();
  };
  
  return collector;
}
