import { StatsDatabase } from './db.js';
import { GeoIPService } from './geo-service.js';

export interface TrafficUpdate {
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

interface BatchConfig {
  // Flush interval in milliseconds
  flushIntervalMs: number;
  
  // Max buffer size before forced flush
  maxBufferSize: number;
  
  // Whether to write connection_logs (can be disabled for minimal retention)
  writeConnectionLogs: boolean;
}

const DEFAULT_CONFIG: BatchConfig = {
  flushIntervalMs: 1000,      // Flush every 1 second
  maxBufferSize: 1000,        // Force flush at 1000 entries
  writeConnectionLogs: true,  // Enable by default
};

/**
 * Optimized batch writer for traffic data
 * 
 * Key optimizations:
 * 1. In-memory buffering to reduce SQLite transactions
 * 2. Aggregation of same-key updates within batch window
 * 3. Single transaction for all stats tables
 * 4. Optional connection_logs for storage efficiency
 */
export class BatchWriter {
  private db: StatsDatabase;
  private geoService?: GeoIPService;
  private config: BatchConfig;
  
  // Buffer storage
  private buffer: Map<string, TrafficUpdate & { count: number; firstSeen: number }> = new Map();
  private geoQueue: GeoIPResult[] = [];
  private connectionLogBuffer: TrafficUpdate[] = [];
  
  // Flush management
  private flushTimer: NodeJS.Timeout | null = null;
  private lastFlushTime = 0;
  private isFlushing = false;
  
  // Metrics
  private totalBuffered = 0;
  private totalFlushed = 0;

  constructor(
    db: StatsDatabase,
    geoService?: GeoIPService,
    config: Partial<BatchConfig> = {}
  ) {
    this.db = db;
    this.geoService = geoService;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startFlushTimer();
  }

  /**
   * Add a traffic update to the buffer
   * Returns immediately, data is written on next flush
   */
  add(backendId: number, update: TrafficUpdate): void {
    // Create aggregation key (domain + ip + chain for granular tracking)
    const key = `${backendId}:${update.domain}:${update.ip}:${update.chain}`;
    const now = Date.now();
    
    const existing = this.buffer.get(key);
    if (existing) {
      // Aggregate with existing entry
      existing.upload += update.upload;
      existing.download += update.download;
      existing.count += 1;
    } else {
      // New entry
      this.buffer.set(key, {
        ...update,
        count: 1,
        firstSeen: now,
      });
    }
    
    // Also buffer for connection_logs if enabled
    if (this.config.writeConnectionLogs) {
      this.connectionLogBuffer.push(update);
    }
    
    this.totalBuffered++;
    
    // Check if we need to force flush
    if (this.buffer.size >= this.config.maxBufferSize) {
      this.flush(backendId);
    }
  }

  /**
   * Queue GeoIP result for batch country stats update
   */
  queueGeoIP(ip: string, geo: GeoIPResult['geo'], upload: number, download: number): void {
    this.geoQueue.push({ ip, geo, upload, download });
  }

  /**
   * Force flush all buffered data to database
   */
  async flush(backendId: number): Promise<void> {
    if (this.isFlushing || this.buffer.size === 0) {
      return;
    }

    this.isFlushing = true;
    const startTime = Date.now();

    try {
      // Copy buffers and clear immediately to allow new data during write
      const updates = Array.from(this.buffer.values());
      const geoResults = [...this.geoQueue];
      const connectionLogs = this.config.writeConnectionLogs 
        ? [...this.connectionLogBuffer] 
        : [];
      
      this.buffer.clear();
      this.geoQueue = [];
      if (this.config.writeConnectionLogs) {
        this.connectionLogBuffer = [];
      }

      // Perform batch write in single transaction
      this.db.batchUpdateTrafficStats(backendId, updates.map(u => ({
        domain: u.domain,
        ip: u.ip,
        chain: u.chain,
        chains: u.chains,
        upload: u.upload,
        download: u.download,
      })));

      // Process GeoIP results
      for (const result of geoResults) {
        if (result.geo) {
          this.db.updateCountryStats(
            backendId,
            result.geo.country,
            result.geo.country_name,
            result.geo.continent,
            result.upload,
            result.download
          );
        }
      }

      // Write connection logs (may be skipped if disabled)
      if (connectionLogs.length > 0) {
        this.db.batchInsertConnectionLogs(backendId, connectionLogs);
      }

      this.totalFlushed += updates.length;
      
      const duration = Date.now() - startTime;
      if (duration > 100) {
        console.log(`[BatchWriter] Flushed ${updates.length} updates in ${duration}ms`);
      }
    } catch (err) {
      console.error('[BatchWriter] Flush failed:', err);
      // TODO: Implement retry or error recovery
    } finally {
      this.isFlushing = false;
      this.lastFlushTime = Date.now();
    }
  }

  /**
   * Get current buffer statistics
   */
  getStats(): { buffered: number; flushed: number; pendingFlush: number } {
    return {
      buffered: this.totalBuffered,
      flushed: this.totalFlushed,
      pendingFlush: this.buffer.size,
    };
  }

  /**
   * Stop the flush timer and cleanup
   */
  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Start the automatic flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      // Timer check is done at backend level
    }, this.config.flushIntervalMs);
  }
}
