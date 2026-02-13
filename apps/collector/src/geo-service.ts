import type { StatsDatabase } from "./db.js";

export interface GeoLocation {
  country: string;
  country_name: string;
  city: string;
  asn: string;
  as_name: string;
  as_domain: string;
  continent: string;
  continent_name: string;
}

export class GeoIPService {
  private db: StatsDatabase;
  private pendingQueries: Map<string, Promise<GeoLocation | null>> = new Map();
  private failedIPs: Map<string, number> = new Map(); // IP -> failure timestamp
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 100; // Minimum 100ms between requests
  private queue: {
    ip: string;
    resolve: (value: GeoLocation | null) => void;
  }[] = [];
  private isProcessing: boolean = false;
  private processorTimer: NodeJS.Timeout | null = null;

  // Failed IPs won't be retried for 30 minutes
  private static FAIL_COOLDOWN_MS = 30 * 60 * 1000;
  // Maximum queue size to prevent unbounded memory growth
  private static MAX_QUEUE_SIZE = 100;

  constructor(db: StatsDatabase) {
    this.db = db;
  }

  // Get geolocation for an IP (with caching)
  async getGeoLocation(ip: string): Promise<GeoLocation | null> {
    // Skip private/local IPs
    if (this.isPrivateIP(ip)) {
      return {
        country: "LOCAL",
        country_name: "Local Network",
        city: "",
        asn: "",
        as_name: "Local Network",
        as_domain: "",
        continent: "LOCAL",
        continent_name: "Local Network",
      };
    }

    // Skip recently failed IPs (30 min cooldown)
    const failedAt = this.failedIPs.get(ip);
    if (failedAt && Date.now() - failedAt < GeoIPService.FAIL_COOLDOWN_MS) {
      return null;
    }

    // Check cache first
    const cached = this.db.getIPGeolocation(ip);
    if (cached) {
      return {
        country: cached.country,
        country_name: cached.country_name,
        city: cached.city,
        asn: cached.asn,
        as_name: cached.as_name,
        as_domain: cached.as_domain,
        continent: cached.continent,
        continent_name: cached.continent_name,
      };
    }

    // Check if there's already a pending query for this IP
    const pending = this.pendingQueries.get(ip);
    if (pending) {
      return pending;
    }

    // Create new query promise
    const promise = this.queryWithQueue(ip);
    this.pendingQueries.set(ip, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      this.pendingQueries.delete(ip);
    }
  }

  // Queue-based query to respect rate limits
  private async queryWithQueue(ip: string): Promise<GeoLocation | null> {
    // Drop requests when queue is overloaded to prevent memory buildup
    if (this.queue.length >= GeoIPService.MAX_QUEUE_SIZE) {
      return null;
    }
    return new Promise((resolve) => {
      this.queue.push({ ip, resolve });
      this.scheduleProcessing();
    });
  }

  // Schedule queue processing (on-demand, no idle spinning)
  private scheduleProcessing() {
    if (this.processorTimer || this.isProcessing) return;

    const delay = Math.max(0, this.minRequestInterval - (Date.now() - this.lastRequestTime));
    this.processorTimer = setTimeout(() => {
      this.processorTimer = null;
      this.processNext();
    }, delay);
  }

  // Process the next item in the queue
  private async processNext() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    const item = this.queue.shift()!;

    try {
      const result = await this.queryAPI(item.ip);
      this.lastRequestTime = Date.now();
      item.resolve(result);
    } catch (err) {
      console.error(`[GeoIP] Error querying ${item.ip}:`, err);
      item.resolve(null);
    } finally {
      this.isProcessing = false;
      // Continue processing if more items in queue
      if (this.queue.length > 0) {
        this.scheduleProcessing();
      }
    }
  }

  // Query the API
  private async queryAPI(ip: string): Promise<GeoLocation | null> {
    try {
      console.log(`[GeoIP] Querying API for: ${ip}`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(
        `https://api.ipinfo.es/ipinfo?ip=${ip}&meituan=false`,
        {
          signal: controller.signal,
          headers: {
            Accept: "application/json",
          },
        },
      );

      clearTimeout(timeout);

      if (!response.ok) {
        console.error(`[GeoIP] API error for ${ip}: ${response.status}`);
        this.failedIPs.set(ip, Date.now());
        return null;
      }

      const data = (await response.json()) as {
        country?: string;
        country_name?: string;
        city?: string;
        asn?: string;
        as_name?: string;
        as_domain?: string;
        continent?: string;
        continent_name?: string;
      };

      const geo: GeoLocation = {
        country: data.country || "Unknown",
        country_name: data.country_name || "Unknown",
        city: data.city || "",
        asn: data.asn || "",
        as_name: data.as_name || "",
        as_domain: data.as_domain || "",
        continent: data.continent || "Unknown",
        continent_name: data.continent_name || "Unknown",
      };

      // Save to cache
      this.db.saveIPGeolocation(ip, geo);
      console.log(`[GeoIP] Cached: ${ip} -> ${geo.country_name}`);

      return geo;
    } catch (err) {
      console.error(`[GeoIP] Failed to query ${ip}:`, err);
      this.failedIPs.set(ip, Date.now());
      return null;
    }
  }

  // Check if IP is private/local
  private isPrivateIP(ip: string): boolean {
    // IPv4 private ranges
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^192\.168\./,
      /^127\./,
      /^0\./,
      /^255\./,
      /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./, // CGNAT
    ];

    // IPv6 private
    if (ip.includes(":")) {
      return (
        ip.startsWith("fc") ||
        ip.startsWith("fd") ||
        ip.startsWith("fe80") ||
        ip.startsWith("::1") ||
        ip === "::1"
      );
    }

    return privateRanges.some((range) => range.test(ip));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Bulk query IPs (for backfill)
  async bulkQueryIPs(ips: string[]): Promise<void> {
    const uniqueIPs = [...new Set(ips)].filter((ip) => !this.isPrivateIP(ip));
    console.log(`[GeoIP] Bulk querying ${uniqueIPs.length} IPs`);

    for (const ip of uniqueIPs) {
      // Check if already cached
      const cached = this.db.getIPGeolocation(ip);
      if (!cached) {
        await this.getGeoLocation(ip);
        // Small delay to respect rate limits
        await this.sleep(150);
      }
    }
  }
}
