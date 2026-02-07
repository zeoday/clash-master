import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type { Connection, DomainStats, IPStats, HourlyStats, DailyStats, ProxyStats, RuleStats, ProxyTrafficStats } from '@clashmaster/shared';
// Retention config stored in database (doesn't include cleanupInterval)
interface DatabaseRetentionConfig {
  connectionLogsDays: number;
  hourlyStatsDays: number;
  autoCleanup: boolean;
}

export interface TrafficUpdate {
  domain: string;
  ip: string;
  chain: string;
  chains: string[];
  upload: number;
  download: number;
}

export interface BackendConfig {
  id: number;
  name: string;
  url: string;
  token: string;
  enabled: boolean;
  is_active: boolean;
  listening: boolean;
  created_at: string;
  updated_at: string;
}

export class StatsDatabase {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath = 'stats.db') {
    this.dbPath = path.resolve(dbPath);
    this.db = new Database(this.dbPath);
    this.init();
  }

  private init() {
    // Domain statistics - aggregated by domain per backend
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS domain_stats (
        backend_id INTEGER NOT NULL,
        domain TEXT NOT NULL,
        ips TEXT,
        total_upload INTEGER DEFAULT 0,
        total_download INTEGER DEFAULT 0,
        total_connections INTEGER DEFAULT 0,
        last_seen DATETIME,
        rules TEXT,
        chains TEXT,
        PRIMARY KEY (backend_id, domain),
        FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
      );
    `);

    // IP statistics per backend
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ip_stats (
        backend_id INTEGER NOT NULL,
        ip TEXT NOT NULL,
        domains TEXT,
        total_upload INTEGER DEFAULT 0,
        total_download INTEGER DEFAULT 0,
        total_connections INTEGER DEFAULT 0,
        last_seen DATETIME,
        asn TEXT,
        geoip TEXT,
        chains TEXT,
        PRIMARY KEY (backend_id, ip),
        FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
      );
    `);

    // Proxy/Chain statistics per backend
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS proxy_stats (
        backend_id INTEGER NOT NULL,
        chain TEXT NOT NULL,
        total_upload INTEGER DEFAULT 0,
        total_download INTEGER DEFAULT 0,
        total_connections INTEGER DEFAULT 0,
        last_seen DATETIME,
        PRIMARY KEY (backend_id, chain),
        FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
      );
    `);

    // Rule statistics per backend
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rule_stats (
        backend_id INTEGER NOT NULL,
        rule TEXT NOT NULL,
        final_proxy TEXT,
        total_upload INTEGER DEFAULT 0,
        total_download INTEGER DEFAULT 0,
        total_connections INTEGER DEFAULT 0,
        last_seen DATETIME,
        PRIMARY KEY (backend_id, rule),
        FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
      );
    `);

    // Rule to proxy mapping per backend
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rule_proxy_map (
        backend_id INTEGER NOT NULL,
        rule TEXT,
        proxy TEXT,
        PRIMARY KEY (backend_id, rule, proxy),
        FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
      );
    `);

    // ASN cache
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS asn_cache (
        ip TEXT PRIMARY KEY,
        asn TEXT,
        org TEXT,
        queried_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // GeoIP cache
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS geoip_cache (
        ip TEXT PRIMARY KEY,
        country TEXT,
        country_name TEXT,
        city TEXT,
        asn TEXT,
        as_name TEXT,
        as_domain TEXT,
        continent TEXT,
        continent_name TEXT,
        queried_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Country traffic statistics per backend
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS country_stats (
        backend_id INTEGER NOT NULL,
        country TEXT NOT NULL,
        country_name TEXT,
        continent TEXT,
        total_upload INTEGER DEFAULT 0,
        total_download INTEGER DEFAULT 0,
        total_connections INTEGER DEFAULT 0,
        last_seen DATETIME,
        PRIMARY KEY (backend_id, country),
        FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
      );
    `);

    // Hourly aggregation per backend
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS hourly_stats (
        backend_id INTEGER NOT NULL,
        hour TEXT NOT NULL,
        upload INTEGER DEFAULT 0,
        download INTEGER DEFAULT 0,
        connections INTEGER DEFAULT 0,
        PRIMARY KEY (backend_id, hour),
        FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
      );
    `);

    // Connection log per backend
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS connection_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        backend_id INTEGER NOT NULL,
        domain TEXT,
        ip TEXT,
        chain TEXT,
        upload INTEGER DEFAULT 0,
        download INTEGER DEFAULT 0,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
      );
    `);

    // Create indexes
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_domain_stats_backend ON domain_stats(backend_id);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_domain_stats_traffic ON domain_stats(total_download + total_upload);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_ip_stats_backend ON ip_stats(backend_id);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_ip_stats_traffic ON ip_stats(total_download + total_upload);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_proxy_stats_backend ON proxy_stats(backend_id);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_proxy_stats_traffic ON proxy_stats(total_download + total_upload);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_rule_stats_backend ON rule_stats(backend_id);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_rule_stats_traffic ON rule_stats(total_download + total_upload);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_rule_proxy_map ON rule_proxy_map(backend_id, rule, proxy);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_country_stats_backend ON country_stats(backend_id);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_hourly_stats_backend ON hourly_stats(backend_id);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_connection_logs_backend ON connection_logs(backend_id);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_connection_logs_timestamp ON connection_logs(timestamp);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_connection_logs_domain ON connection_logs(domain);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_connection_logs_chain ON connection_logs(chain);`);

    // Backend configurations - stores OpenClash backend connections
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS backend_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        token TEXT DEFAULT '',
        enabled BOOLEAN DEFAULT 1,
        is_active BOOLEAN DEFAULT 0,
        listening BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create unique index on name
    this.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_backend_configs_name ON backend_configs(name);`);

    // App configuration - stores app-level settings like retention policy
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert default retention config if not exists
    this.db.exec(`
      INSERT OR IGNORE INTO app_config (key, value) VALUES 
        ('retention.connection_logs_days', '7'),
        ('retention.hourly_stats_days', '30'),
        ('retention.auto_cleanup', '1');
    `);

    // Migrate existing data if needed (from single-backend schema)
    this.migrateIfNeeded();
  }

  // Migrate from old single-backend schema to multi-backend schema
  private migrateIfNeeded() {
    // Check if we need to migrate by checking if there's data without backend_id
    const needsMigration = this.db.prepare(`
      SELECT 1 FROM sqlite_master 
      WHERE type='table' AND name='domain_stats'
    `).get() as { '1': number } | undefined;

    if (!needsMigration) return;

    // Check if domain_stats table has backend_id column
    const tableInfo = this.db.prepare(`PRAGMA table_info(domain_stats)`).all() as { name: string }[];
    const hasBackendId = tableInfo.some(col => col.name === 'backend_id');

    if (!hasBackendId) {
      console.log('[DB] Migrating from single-backend to multi-backend schema...');
      this.performMigration();
    }

    // Check if backend_configs has listening column
    const backendInfo = this.db.prepare(`PRAGMA table_info(backend_configs)`).all() as { name: string }[];
    const hasListening = backendInfo.some(col => col.name === 'listening');

    if (!hasListening) {
      console.log('[DB] Adding listening column to backend_configs...');
      this.db.exec(`ALTER TABLE backend_configs ADD COLUMN listening BOOLEAN DEFAULT 1;`);
    }

    // Check if ip_stats has chains column (added for proxy display per IP)
    const ipStatsInfo = this.db.prepare(`PRAGMA table_info(ip_stats)`).all() as { name: string }[];
    const hasIPChains = ipStatsInfo.some(col => col.name === 'chains');

    if (!hasIPChains) {
      console.log('[DB] Adding chains column to ip_stats...');
      this.db.exec(`ALTER TABLE ip_stats ADD COLUMN chains TEXT;`);
    }
  }

  private performMigration() {
    // Create temporary tables with new schema and migrate data
    // This is a complex migration - we'll create a default backend and associate all data with it

    this.db.exec(`BEGIN TRANSACTION;`);

    try {
      // Create a default backend if none exists
      const existingBackend = this.db.prepare(`SELECT id FROM backend_configs LIMIT 1`).get() as { id: number } | undefined;
      let defaultBackendId: number;

      if (!existingBackend) {
        const result = this.db.prepare(`
          INSERT INTO backend_configs (name, url, token, enabled, is_active, listening)
          VALUES ('Default', 'http://192.168.1.1:9090', '', 1, 1, 1)
        `).run();
        defaultBackendId = Number(result.lastInsertRowid);
      } else {
        defaultBackendId = existingBackend.id;
      }

      // Migrate domain_stats - recreate table with new schema
      this.db.exec(`
        CREATE TABLE domain_stats_new (
          backend_id INTEGER NOT NULL,
          domain TEXT NOT NULL,
          ips TEXT,
          total_upload INTEGER DEFAULT 0,
          total_download INTEGER DEFAULT 0,
          total_connections INTEGER DEFAULT 0,
          last_seen DATETIME,
          rules TEXT,
          chains TEXT,
          PRIMARY KEY (backend_id, domain),
          FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
        );
      `);
      this.db.exec(`
        INSERT INTO domain_stats_new 
        SELECT ${defaultBackendId} as backend_id, domain, ips, total_upload, total_download, 
               total_connections, last_seen, rules, chains 
        FROM domain_stats;
      `);
      this.db.exec(`DROP TABLE domain_stats;`);
      this.db.exec(`ALTER TABLE domain_stats_new RENAME TO domain_stats;`);

      // Migrate ip_stats
      this.db.exec(`
        CREATE TABLE ip_stats_new (
          backend_id INTEGER NOT NULL,
          ip TEXT NOT NULL,
          domains TEXT,
          total_upload INTEGER DEFAULT 0,
          total_download INTEGER DEFAULT 0,
          total_connections INTEGER DEFAULT 0,
          last_seen DATETIME,
          asn TEXT,
          geoip TEXT,
          chains TEXT,
          PRIMARY KEY (backend_id, ip),
          FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
        );
      `);
      this.db.exec(`
        INSERT INTO ip_stats_new 
        SELECT ${defaultBackendId} as backend_id, ip, domains, total_upload, total_download, 
               total_connections, last_seen, asn, geoip, NULL 
        FROM ip_stats;
      `);
      this.db.exec(`DROP TABLE ip_stats;`);
      this.db.exec(`ALTER TABLE ip_stats_new RENAME TO ip_stats;`);

      // Migrate proxy_stats
      this.db.exec(`
        CREATE TABLE proxy_stats_new (
          backend_id INTEGER NOT NULL,
          chain TEXT NOT NULL,
          total_upload INTEGER DEFAULT 0,
          total_download INTEGER DEFAULT 0,
          total_connections INTEGER DEFAULT 0,
          last_seen DATETIME,
          PRIMARY KEY (backend_id, chain),
          FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
        );
      `);
      this.db.exec(`
        INSERT INTO proxy_stats_new 
        SELECT ${defaultBackendId} as backend_id, chain, total_upload, total_download, 
               total_connections, last_seen 
        FROM proxy_stats;
      `);
      this.db.exec(`DROP TABLE proxy_stats;`);
      this.db.exec(`ALTER TABLE proxy_stats_new RENAME TO proxy_stats;`);

      // Migrate rule_stats
      this.db.exec(`
        CREATE TABLE rule_stats_new (
          backend_id INTEGER NOT NULL,
          rule TEXT NOT NULL,
          final_proxy TEXT,
          total_upload INTEGER DEFAULT 0,
          total_download INTEGER DEFAULT 0,
          total_connections INTEGER DEFAULT 0,
          last_seen DATETIME,
          PRIMARY KEY (backend_id, rule),
          FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
        );
      `);
      this.db.exec(`
        INSERT INTO rule_stats_new 
        SELECT ${defaultBackendId} as backend_id, rule, final_proxy, total_upload, total_download, 
               total_connections, last_seen 
        FROM rule_stats;
      `);
      this.db.exec(`DROP TABLE rule_stats;`);
      this.db.exec(`ALTER TABLE rule_stats_new RENAME TO rule_stats;`);

      // Migrate rule_proxy_map
      this.db.exec(`
        CREATE TABLE rule_proxy_map_new (
          backend_id INTEGER NOT NULL,
          rule TEXT,
          proxy TEXT,
          PRIMARY KEY (backend_id, rule, proxy),
          FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
        );
      `);
      this.db.exec(`
        INSERT INTO rule_proxy_map_new 
        SELECT ${defaultBackendId} as backend_id, rule, proxy 
        FROM rule_proxy_map;
      `);
      this.db.exec(`DROP TABLE rule_proxy_map;`);
      this.db.exec(`ALTER TABLE rule_proxy_map_new RENAME TO rule_proxy_map;`);

      // Migrate country_stats
      this.db.exec(`
        CREATE TABLE country_stats_new (
          backend_id INTEGER NOT NULL,
          country TEXT NOT NULL,
          country_name TEXT,
          continent TEXT,
          total_upload INTEGER DEFAULT 0,
          total_download INTEGER DEFAULT 0,
          total_connections INTEGER DEFAULT 0,
          last_seen DATETIME,
          PRIMARY KEY (backend_id, country),
          FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
        );
      `);
      this.db.exec(`
        INSERT INTO country_stats_new 
        SELECT ${defaultBackendId} as backend_id, country, country_name, continent, total_upload, 
               total_download, total_connections, last_seen 
        FROM country_stats;
      `);
      this.db.exec(`DROP TABLE country_stats;`);
      this.db.exec(`ALTER TABLE country_stats_new RENAME TO country_stats;`);

      // Migrate hourly_stats
      this.db.exec(`
        CREATE TABLE hourly_stats_new (
          backend_id INTEGER NOT NULL,
          hour TEXT NOT NULL,
          upload INTEGER DEFAULT 0,
          download INTEGER DEFAULT 0,
          connections INTEGER DEFAULT 0,
          PRIMARY KEY (backend_id, hour),
          FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
        );
      `);
      this.db.exec(`
        INSERT INTO hourly_stats_new 
        SELECT ${defaultBackendId} as backend_id, hour, upload, download, connections 
        FROM hourly_stats;
      `);
      this.db.exec(`DROP TABLE hourly_stats;`);
      this.db.exec(`ALTER TABLE hourly_stats_new RENAME TO hourly_stats;`);

      // Migrate connection_logs
      this.db.exec(`
        CREATE TABLE connection_logs_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          backend_id INTEGER NOT NULL,
          domain TEXT,
          ip TEXT,
          chain TEXT,
          upload INTEGER DEFAULT 0,
          download INTEGER DEFAULT 0,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (backend_id) REFERENCES backend_configs(id) ON DELETE CASCADE
        );
      `);
      this.db.exec(`
        INSERT INTO connection_logs_new (id, backend_id, domain, ip, chain, upload, download, timestamp)
        SELECT id, ${defaultBackendId} as backend_id, domain, ip, chain, upload, download, timestamp 
        FROM connection_logs;
      `);
      this.db.exec(`DROP TABLE connection_logs;`);
      this.db.exec(`ALTER TABLE connection_logs_new RENAME TO connection_logs;`);

      this.db.exec(`COMMIT;`);
      console.log('[DB] Migration completed successfully');
    } catch (error) {
      this.db.exec(`ROLLBACK;`);
      console.error('[DB] Migration failed:', error);
      throw error;
    }
  }

  // Update traffic stats with delta values for a specific backend
  updateTrafficStats(backendId: number, update: TrafficUpdate) {
    const now = new Date();
    const timestamp = now.toISOString();
    const hour = timestamp.slice(0, 13) + ':00:00';
    
    // Only process if there's actual traffic
    if (update.upload === 0 && update.download === 0) return;

    // Get the initial rule (last element in chains array) and final proxy (first element)
    const initialRule = update.chains.length > 0 ? update.chains[update.chains.length - 1] : 'DIRECT';
    const finalProxy = update.chains.length > 0 ? update.chains[0] : 'DIRECT';

    const transaction = this.db.transaction(() => {
      // Update domain stats with backend_id (skip if domain is unknown)
      const domainName = update.domain || 'unknown';
      if (domainName !== 'unknown') {
        const domainStmt = this.db.prepare(`
          INSERT INTO domain_stats (backend_id, domain, ips, total_upload, total_download, total_connections, last_seen, rules, chains)
          VALUES (@backendId, @domain, @ip, @upload, @download, 1, @timestamp, @rule, @chain)
          ON CONFLICT(backend_id, domain) DO UPDATE SET
            ips = CASE 
              WHEN domain_stats.ips IS NULL THEN @ip
              WHEN INSTR(domain_stats.ips, @ip) > 0 THEN domain_stats.ips
              ELSE domain_stats.ips || ',' || @ip
            END,
            total_upload = total_upload + @upload,
            total_download = total_download + @download,
            total_connections = total_connections + 1,
            last_seen = @timestamp,
            rules = CASE 
              WHEN domain_stats.rules IS NULL THEN @rule
              WHEN INSTR(domain_stats.rules, @rule) > 0 THEN domain_stats.rules
              ELSE domain_stats.rules || ',' || @rule
            END,
            chains = CASE 
              WHEN domain_stats.chains IS NULL THEN @chain
              WHEN INSTR(domain_stats.chains, @chain) > 0 THEN domain_stats.chains
              ELSE domain_stats.chains || ',' || @chain
            END
        `);
        domainStmt.run({
          backendId,
          domain: domainName,
          ip: update.ip,
          upload: update.upload,
          download: update.download,
          timestamp,
          rule: initialRule,
          chain: update.chain
        });
      }

      // Update IP stats with backend_id
      const ipStmt = this.db.prepare(`
        INSERT INTO ip_stats (backend_id, ip, domains, total_upload, total_download, total_connections, last_seen, chains)
        VALUES (@backendId, @ip, @domain, @upload, @download, 1, @timestamp, @chain)
        ON CONFLICT(backend_id, ip) DO UPDATE SET
          domains = CASE 
            WHEN ip_stats.domains IS NULL THEN @domain
            WHEN INSTR(ip_stats.domains, @domain) > 0 THEN ip_stats.domains
            ELSE ip_stats.domains || ',' || @domain
          END,
          total_upload = total_upload + @upload,
          total_download = total_download + @download,
          total_connections = total_connections + 1,
          last_seen = @timestamp,
          chains = CASE 
            WHEN ip_stats.chains IS NULL THEN @chain
            WHEN INSTR(ip_stats.chains, @chain) > 0 THEN ip_stats.chains
            ELSE ip_stats.chains || ',' || @chain
          END
      `);
      ipStmt.run({
        backendId,
        ip: update.ip,
        domain: update.domain || 'unknown',
        upload: update.upload,
        download: update.download,
        timestamp,
        chain: update.chain
      });

      // Update proxy stats with backend_id
      const proxyStmt = this.db.prepare(`
        INSERT INTO proxy_stats (backend_id, chain, total_upload, total_download, total_connections, last_seen)
        VALUES (@backendId, @chain, @upload, @download, 1, @timestamp)
        ON CONFLICT(backend_id, chain) DO UPDATE SET
          total_upload = total_upload + @upload,
          total_download = total_download + @download,
          total_connections = total_connections + 1,
          last_seen = @timestamp
      `);
      proxyStmt.run({
        backendId,
        chain: update.chain,
        upload: update.upload,
        download: update.download,
        timestamp
      });

      // Update rule stats with backend_id
      const ruleStmt = this.db.prepare(`
        INSERT INTO rule_stats (backend_id, rule, final_proxy, total_upload, total_download, total_connections, last_seen)
        VALUES (@backendId, @rule, @finalProxy, @upload, @download, 1, @timestamp)
        ON CONFLICT(backend_id, rule) DO UPDATE SET
          final_proxy = @finalProxy,
          total_upload = total_upload + @upload,
          total_download = total_download + @download,
          total_connections = total_connections + 1,
          last_seen = @timestamp
      `);
      ruleStmt.run({
        backendId,
        rule: initialRule,
        finalProxy,
        upload: update.upload,
        download: update.download,
        timestamp
      });

      // Update rule-proxy mapping with backend_id
      if (update.chains.length > 1) {
        const rule = update.chains[update.chains.length - 1];
        const proxy = update.chains[0];
        const ruleProxyStmt = this.db.prepare(`
          INSERT OR IGNORE INTO rule_proxy_map (backend_id, rule, proxy)
          VALUES (@backendId, @rule, @proxy)
        `);
        ruleProxyStmt.run({ backendId, rule, proxy });
      }

      // Update hourly stats with backend_id
      const hourlyStmt = this.db.prepare(`
        INSERT INTO hourly_stats (backend_id, hour, upload, download, connections)
        VALUES (@backendId, @hour, @upload, @download, 1)
        ON CONFLICT(backend_id, hour) DO UPDATE SET
          upload = upload + @upload,
          download = download + @download,
          connections = connections + 1
      `);
      hourlyStmt.run({ backendId, hour, upload: update.upload, download: update.download });

      // Insert connection log with backend_id
      const logStmt = this.db.prepare(`
        INSERT INTO connection_logs (backend_id, domain, ip, chain, upload, download)
        VALUES (@backendId, @domain, @ip, @chain, @upload, @download)
      `);
      logStmt.run({
        backendId,
        domain: update.domain || 'unknown',
        ip: update.ip,
        chain: update.chain,
        upload: update.upload,
        download: update.download
      });
    });

    transaction();
  }

  // Batch update traffic stats - processes multiple updates in a single transaction
  batchUpdateTrafficStats(backendId: number, updates: TrafficUpdate[]) {
    if (updates.length === 0) return;

    const now = new Date();
    const timestamp = now.toISOString();
    const hour = timestamp.slice(0, 13) + ':00:00';

    // Aggregate updates by domain, ip, chain to reduce UPSERT conflicts
    const domainMap = new Map<string, TrafficUpdate & { count: number }>();
    const ipMap = new Map<string, TrafficUpdate & { count: number }>();
    const chainMap = new Map<string, { chains: string[]; upload: number; download: number; count: number }>();
    const ruleProxyMap = new Map<string, { rule: string; proxy: string; count: number }>();
    const hourlyMap = new Map<string, { upload: number; download: number; connections: number }>();

    for (const update of updates) {
      if (update.upload === 0 && update.download === 0) continue;

      const initialRule = update.chains.length > 0 ? update.chains[update.chains.length - 1] : 'DIRECT';
      const finalProxy = update.chains.length > 0 ? update.chains[0] : 'DIRECT';

      // Aggregate domain stats
      if (update.domain) {
        const domainKey = `${update.domain}:${update.ip}:${update.chain}`;
        const existing = domainMap.get(domainKey);
        if (existing) {
          existing.upload += update.upload;
          existing.download += update.download;
          existing.count++;
        } else {
          domainMap.set(domainKey, { ...update, count: 1 });
        }
      }

      // Aggregate IP stats
      const ipKey = `${update.ip}:${update.domain}:${update.chain}`;
      const existingIp = ipMap.get(ipKey);
      if (existingIp) {
        existingIp.upload += update.upload;
        existingIp.download += update.download;
        existingIp.count++;
      } else {
        ipMap.set(ipKey, { ...update, count: 1 });
      }

      // Aggregate chain stats
      const chainKey = update.chain;
      const existingChain = chainMap.get(chainKey);
      if (existingChain) {
        existingChain.upload += update.upload;
        existingChain.download += update.download;
        existingChain.count++;
      } else {
        chainMap.set(chainKey, { 
          chains: update.chains, 
          upload: update.upload, 
          download: update.download, 
          count: 1 
        });
      }

      // Aggregate rule stats
      const ruleKey = `${initialRule}:${finalProxy}`;
      const existingRule = ruleProxyMap.get(ruleKey);
      if (existingRule) {
        existingRule.count++;
      } else {
        ruleProxyMap.set(ruleKey, { rule: initialRule, proxy: finalProxy, count: 1 });
      }

      // Aggregate hourly stats
      const hourKey = hour;
      const existingHour = hourlyMap.get(hourKey);
      if (existingHour) {
        existingHour.upload += update.upload;
        existingHour.download += update.download;
        existingHour.connections++;
      } else {
        hourlyMap.set(hourKey, { 
          upload: update.upload, 
          download: update.download, 
          connections: 1 
        });
      }
    }

    // Execute batch upserts in a single transaction
    const transaction = this.db.transaction(() => {
      // Domain stats
      const domainStmt = this.db.prepare(`
        INSERT INTO domain_stats (backend_id, domain, ips, total_upload, total_download, total_connections, last_seen, rules, chains)
        VALUES (@backendId, @domain, @ip, @upload, @download, @count, @timestamp, @rule, @chain)
        ON CONFLICT(backend_id, domain) DO UPDATE SET
          ips = CASE 
            WHEN domain_stats.ips IS NULL THEN @ip
            WHEN INSTR(domain_stats.ips, @ip) > 0 THEN domain_stats.ips
            ELSE domain_stats.ips || ',' || @ip
          END,
          total_upload = total_upload + @upload,
          total_download = total_download + @download,
          total_connections = total_connections + @count,
          last_seen = @timestamp,
          rules = CASE 
            WHEN domain_stats.rules IS NULL THEN @rule
            WHEN INSTR(domain_stats.rules, @rule) > 0 THEN domain_stats.rules
            ELSE domain_stats.rules || ',' || @rule
          END,
          chains = CASE 
            WHEN domain_stats.chains IS NULL THEN @chain
            WHEN INSTR(domain_stats.chains, @chain) > 0 THEN domain_stats.chains
            ELSE domain_stats.chains || ',' || @chain
          END
      `);

      for (const [key, data] of domainMap) {
        const initialRule = data.chains.length > 0 ? data.chains[data.chains.length - 1] : 'DIRECT';
        domainStmt.run({
          backendId,
          domain: data.domain,
          ip: data.ip,
          upload: data.upload,
          download: data.download,
          count: data.count,
          timestamp,
          rule: initialRule,
          chain: data.chain
        });
      }

      // IP stats
      const ipStmt = this.db.prepare(`
        INSERT INTO ip_stats (backend_id, ip, domains, total_upload, total_download, total_connections, last_seen, chains)
        VALUES (@backendId, @ip, @domain, @upload, @download, @count, @timestamp, @chain)
        ON CONFLICT(backend_id, ip) DO UPDATE SET
          domains = CASE 
            WHEN ip_stats.domains IS NULL THEN @domain
            WHEN INSTR(ip_stats.domains, @domain) > 0 THEN ip_stats.domains
            ELSE ip_stats.domains || ',' || @domain
          END,
          total_upload = total_upload + @upload,
          total_download = total_download + @download,
          total_connections = total_connections + @count,
          last_seen = @timestamp,
          chains = CASE 
            WHEN ip_stats.chains IS NULL THEN @chain
            WHEN INSTR(ip_stats.chains, @chain) > 0 THEN ip_stats.chains
            ELSE ip_stats.chains || ',' || @chain
          END
      `);

      for (const [key, data] of ipMap) {
        ipStmt.run({
          backendId,
          ip: data.ip,
          domain: data.domain || 'unknown',
          upload: data.upload,
          download: data.download,
          count: data.count,
          timestamp,
          chain: data.chain
        });
      }

      // Chain/Proxy stats
      const proxyStmt = this.db.prepare(`
        INSERT INTO proxy_stats (backend_id, chain, total_upload, total_download, total_connections, last_seen)
        VALUES (@backendId, @chain, @upload, @download, @count, @timestamp)
        ON CONFLICT(backend_id, chain) DO UPDATE SET
          total_upload = total_upload + @upload,
          total_download = total_download + @download,
          total_connections = total_connections + @count,
          last_seen = @timestamp
      `);

      for (const [chain, data] of chainMap) {
        proxyStmt.run({
          backendId,
          chain,
          upload: data.upload,
          download: data.download,
          count: data.count,
          timestamp
        });
      }

      // Rule stats
      const ruleStmt = this.db.prepare(`
        INSERT INTO rule_stats (backend_id, rule, final_proxy, total_upload, total_download, total_connections, last_seen)
        VALUES (@backendId, @rule, @proxy, 0, 0, @count, @timestamp)
        ON CONFLICT(backend_id, rule) DO UPDATE SET
          final_proxy = @proxy,
          total_connections = total_connections + @count,
          last_seen = @timestamp
      `);

      for (const [key, data] of ruleProxyMap) {
        ruleStmt.run({
          backendId,
          rule: data.rule,
          proxy: data.proxy,
          count: data.count,
          timestamp
        });
      }

      // Rule proxy map (only insert, ignore duplicates)
      const ruleProxyStmt = this.db.prepare(`
        INSERT OR IGNORE INTO rule_proxy_map (backend_id, rule, proxy)
        VALUES (@backendId, @rule, @proxy)
      `);

      for (const [key, data] of ruleProxyMap) {
        ruleProxyStmt.run({
          backendId,
          rule: data.rule,
          proxy: data.proxy
        });
      }

      // Hourly stats
      const hourlyStmt = this.db.prepare(`
        INSERT INTO hourly_stats (backend_id, hour, upload, download, connections)
        VALUES (@backendId, @hour, @upload, @download, @connections)
        ON CONFLICT(backend_id, hour) DO UPDATE SET
          upload = upload + @upload,
          download = download + @download,
          connections = connections + @connections
      `);

      for (const [hour, data] of hourlyMap) {
        hourlyStmt.run({
          backendId,
          hour,
          upload: data.upload,
          download: data.download,
          connections: data.connections
        });
      }

      // Batch insert into connection_logs for detailed analytics
      // All records are preserved for accuracy
      const logStmt = this.db.prepare(`
        INSERT INTO connection_logs (backend_id, domain, ip, chain, upload, download)
        VALUES (@backendId, @domain, @ip, @chain, @upload, @download)
      `);

      for (const [key, data] of domainMap) {
        logStmt.run({
          backendId,
          domain: data.domain || 'unknown',
          ip: data.ip,
          chain: data.chain,
          upload: data.upload,
          download: data.download
        });
      }
    });

    transaction();
  }

  // Batch insert connection logs (for optimized bulk writing)
  batchInsertConnectionLogs(backendId: number, logs: Array<{
    domain: string;
    ip: string;
    chain: string;
    upload: number;
    download: number;
  }>): void {
    if (logs.length === 0) return;

    const stmt = this.db.prepare(`
      INSERT INTO connection_logs (backend_id, domain, ip, chain, upload, download)
      VALUES (@backendId, @domain, @ip, @chain, @upload, @download)
    `);

    const transaction = this.db.transaction(() => {
      for (const log of logs) {
        stmt.run({
          backendId,
          domain: log.domain || 'unknown',
          ip: log.ip,
          chain: log.chain,
          upload: log.upload,
          download: log.download,
        });
      }
    });

    transaction();
  }

  // Get a specific domain by name
  getDomainByName(backendId: number, domain: string): DomainStats | null {
    const stmt = this.db.prepare(`
      SELECT domain, total_upload as totalUpload, total_download as totalDownload, 
             total_connections as totalConnections, last_seen as lastSeen, ips, rules, chains
      FROM domain_stats
      WHERE backend_id = ? AND domain = ?
    `);
    const row = stmt.get(backendId, domain) as {
      domain: string;
      totalUpload: number;
      totalDownload: number;
      totalConnections: number;
      lastSeen: string;
      ips: string;
      rules: string | null;
      chains: string | null;
    } | undefined;
    
    if (!row) return null;
    
    return {
      ...row,
      ips: row.ips ? row.ips.split(',') : [],
      rules: row.rules ? row.rules.split(',') : [],
      chains: row.chains ? row.chains.split(',') : [],
    } as DomainStats;
  }

  // Get all domain stats for a specific backend
  getDomainStats(backendId: number, limit = 100): DomainStats[] {
    const stmt = this.db.prepare(`
      SELECT domain, total_upload as totalUpload, total_download as totalDownload, 
             total_connections as totalConnections, last_seen as lastSeen, ips, rules, chains
      FROM domain_stats
      WHERE backend_id = ?
      ORDER BY (total_upload + total_download) DESC
      LIMIT ?
    `);
    const rows = stmt.all(backendId, limit) as Array<{
      domain: string;
      totalUpload: number;
      totalDownload: number;
      totalConnections: number;
      lastSeen: string;
      ips: string | null;
      rules: string | null;
      chains: string | null;
    }>;
    
    return rows.map(row => ({
      ...row,
      ips: row.ips ? row.ips.split(',') : [],
      rules: row.rules ? row.rules.split(',') : [],
      chains: row.chains ? row.chains.split(',') : [],
    })) as DomainStats[];
  }

  // Get IP stats for specific IPs (used for domain IP details)
  getIPStatsByIPs(backendId: number, ips: string[]): IPStats[] {
    if (ips.length === 0) return [];
    
    const placeholders = ips.map(() => '?').join(',');
    const stmt = this.db.prepare(`
      SELECT 
        i.ip, 
        i.domains, 
        i.total_upload as totalUpload, 
        i.total_download as totalDownload, 
        i.total_connections as totalConnections, 
        i.last_seen as lastSeen,
        COALESCE(i.asn, g.asn) as asn,
        CASE 
          WHEN g.country IS NOT NULL THEN 
            json_array(
              g.country,
              COALESCE(g.country_name, g.country),
              COALESCE(g.city, ''),
              COALESCE(g.as_name, '')
            )
          WHEN i.geoip IS NOT NULL THEN 
            json(i.geoip)
          ELSE 
            NULL
        END as geoIP,
        i.chains
      FROM ip_stats i
      LEFT JOIN geoip_cache g ON i.ip = g.ip
      WHERE i.backend_id = ? AND i.ip IN (${placeholders})
      ORDER BY (i.total_upload + i.total_download) DESC
    `);
    const rows = stmt.all(backendId, ...ips) as Array<{
      ip: string;
      domains: string;
      totalUpload: number;
      totalDownload: number;
      totalConnections: number;
      lastSeen: string;
      asn: string | null;
      geoIP: string | null;
      chains: string | null;
    }>;
    
    return rows.map(row => ({
      ...row,
      domains: row.domains ? row.domains.split(',') : [],
      geoIP: row.geoIP ? JSON.parse(row.geoIP).filter(Boolean) : undefined,
      asn: row.asn || undefined,
      chains: row.chains ? row.chains.split(',') : [],
    })) as IPStats[];
  }

  // Get all IP stats for a specific backend
  getIPStats(backendId: number, limit = 100): IPStats[] {
    const stmt = this.db.prepare(`
      SELECT 
        i.ip, 
        i.domains, 
        i.total_upload as totalUpload, 
        i.total_download as totalDownload, 
        i.total_connections as totalConnections, 
        i.last_seen as lastSeen,
        COALESCE(i.asn, g.asn) as asn,
        CASE 
          WHEN g.country IS NOT NULL THEN 
            json_array(
              g.country,
              COALESCE(g.country_name, g.country),
              COALESCE(g.city, ''),
              COALESCE(g.as_name, '')
            )
          WHEN i.geoip IS NOT NULL THEN 
            json(i.geoip)
          ELSE 
            NULL
        END as geoIP,
        i.chains
      FROM ip_stats i
      LEFT JOIN geoip_cache g ON i.ip = g.ip
      WHERE i.backend_id = ?
      ORDER BY (i.total_upload + i.total_download) DESC
      LIMIT ?
    `);
    const rows = stmt.all(backendId, limit) as Array<{
      ip: string;
      domains: string;
      totalUpload: number;
      totalDownload: number;
      totalConnections: number;
      lastSeen: string;
      asn: string | null;
      geoIP: string | null;
      chains: string | null;
    }>;
    
    return rows.map(row => ({
      ...row,
      domains: row.domains ? row.domains.split(',') : [],
      geoIP: row.geoIP ? JSON.parse(row.geoIP).filter(Boolean) : undefined,
      asn: row.asn || undefined,
      chains: row.chains ? row.chains.split(',') : [],
    })) as IPStats[];
  }

  // Get hourly stats for a specific backend
  getHourlyStats(backendId: number, hours = 24): HourlyStats[] {
    const stmt = this.db.prepare(`
      SELECT hour, upload, download, connections
      FROM hourly_stats
      WHERE backend_id = ?
      ORDER BY hour DESC
      LIMIT ?
    `);
    return stmt.all(backendId, hours) as HourlyStats[];
  }

  // Get today's traffic for a specific backend
  getTodayTraffic(backendId: number): { upload: number; download: number } {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const stmt = this.db.prepare(`
      SELECT COALESCE(SUM(upload), 0) as upload, COALESCE(SUM(download), 0) as download
      FROM hourly_stats
      WHERE backend_id = ? AND hour >= ?
    `);
    return stmt.get(backendId, today) as { upload: number; download: number };
  }

  // Get traffic trend for a specific backend (for time range selection)
  getTrafficTrend(backendId: number, minutes = 30): Array<{ time: string; upload: number; download: number }> {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString();
    const stmt = this.db.prepare(`
      SELECT strftime('%Y-%m-%dT%H:%M:%S', timestamp) as time, upload, download
      FROM connection_logs
      WHERE backend_id = ? AND datetime(timestamp) > datetime(?)
      ORDER BY timestamp ASC
    `);
    return stmt.all(backendId, cutoff) as Array<{ time: string; upload: number; download: number }>;
  }

  // Get traffic trend aggregated by time buckets for chart display
  getTrafficTrendAggregated(backendId: number, minutes = 30, bucketMinutes = 1): Array<{ time: string; upload: number; download: number }> {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString();
    
    // SQLite datetime formatting for bucketing
    // Use strftime to bucket by minute intervals
    const bucketExpr = bucketMinutes === 1 
      ? `strftime('%Y-%m-%dT%H:%M:00', datetime(timestamp))`
      : `strftime('%Y-%m-%dT%H:%M:00', datetime((strftime('%s', datetime(timestamp)) / ${bucketMinutes * 60}) * ${bucketMinutes * 60}, 'unixepoch'))`;

    const stmt = this.db.prepare(`
      SELECT 
        ${bucketExpr} as time,
        SUM(upload) as upload,
        SUM(download) as download
      FROM connection_logs
      WHERE backend_id = ? AND datetime(timestamp) > datetime(?)
      GROUP BY ${bucketExpr}
      ORDER BY time ASC
    `);
    return stmt.all(backendId, cutoff) as Array<{ time: string; upload: number; download: number }>;
  }

  // Get country stats for a specific backend
  getCountryStats(backendId: number): Array<{ country: string; countryName: string; continent: string; totalUpload: number; totalDownload: number; totalConnections: number }> {
    const stmt = this.db.prepare(`
      SELECT country, country_name as countryName, continent, 
             total_upload as totalUpload, total_download as totalDownload, 
             total_connections as totalConnections
      FROM country_stats
      WHERE backend_id = ?
      ORDER BY (total_upload + total_download) DESC
    `);
    return stmt.all(backendId) as Array<{ country: string; countryName: string; continent: string; totalUpload: number; totalDownload: number; totalConnections: number }>;
  }

  // Update country stats for a specific backend
  updateCountryStats(backendId: number, country: string, countryName: string, continent: string, upload: number, download: number) {
    const stmt = this.db.prepare(`
      INSERT INTO country_stats (backend_id, country, country_name, continent, total_upload, total_download, total_connections, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(backend_id, country) DO UPDATE SET
        total_upload = total_upload + ?,
        total_download = total_download + ?,
        total_connections = total_connections + 1,
        last_seen = CURRENT_TIMESTAMP
    `);
    stmt.run(backendId, country, countryName, continent, upload, download, upload, download);
  }

  // Get top domains for a specific backend
  getTopDomains(backendId: number, limit = 10): DomainStats[] {
    return this.getDomainStats(backendId, limit);
  }

  // Get top IPs for a specific backend
  getTopIPs(backendId: number, limit = 10): IPStats[] {
    return this.getIPStats(backendId, limit);
  }

  // Get proxy stats for a specific backend
  getProxyStats(backendId: number): ProxyStats[] {
    const stmt = this.db.prepare(`
      SELECT chain, total_upload as totalUpload, total_download as totalDownload, 
             total_connections as totalConnections, last_seen as lastSeen
      FROM proxy_stats
      WHERE backend_id = ?
      ORDER BY (total_upload + total_download) DESC
    `);
    return stmt.all(backendId) as ProxyStats[];
  }

  // Get rule stats for a specific backend
  getRuleStats(backendId: number): RuleStats[] {
    const stmt = this.db.prepare(`
      SELECT rule, final_proxy as finalProxy, total_upload as totalUpload, total_download as totalDownload, 
             total_connections as totalConnections, last_seen as lastSeen
      FROM rule_stats
      WHERE backend_id = ?
      ORDER BY (total_upload + total_download) DESC
    `);
    return stmt.all(backendId) as RuleStats[];
  }

  // Get rule-proxy mapping for a specific backend
  getRuleProxyMap(backendId: number): Array<{ rule: string; proxies: string[] }> {
    const stmt = this.db.prepare(`
      SELECT rule, proxy FROM rule_proxy_map WHERE backend_id = ? ORDER BY rule, proxy
    `);
    const rows = stmt.all(backendId) as Array<{ rule: string; proxy: string }>;
    
    const map = new Map<string, string[]>();
    for (const row of rows) {
      if (!map.has(row.rule)) {
        map.set(row.rule, []);
      }
      map.get(row.rule)!.push(row.proxy);
    }
    
    return Array.from(map.entries()).map(([rule, proxies]) => ({ rule, proxies }));
  }

  // Update ASN info for an IP
  updateASNInfo(ip: string, asn: string, org: string) {
    const stmt = this.db.prepare(`
      INSERT INTO asn_cache (ip, asn, org, queried_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(ip) DO UPDATE SET
        asn = ?,
        org = ?,
        queried_at = CURRENT_TIMESTAMP
    `);
    stmt.run(ip, asn, org, asn, org);
  }

  // Get ASN info for IPs
  getASNInfo(ips: string[]): Array<{ ip: string; asn: string; org: string }> {
    const stmt = this.db.prepare(`
      SELECT ip, asn, org FROM asn_cache WHERE ip IN (${ips.map(() => '?').join(',')})
    `);
    return stmt.all(...ips) as Array<{ ip: string; asn: string; org: string }>;
  }

  // Get ASN info for a single IP
  getASNInfoForIP(ip: string): { ip: string; asn: string; org: string } | undefined {
    const stmt = this.db.prepare(`SELECT ip, asn, org FROM asn_cache WHERE ip = ?`);
    return stmt.get(ip) as { ip: string; asn: string; org: string } | undefined;
  }

  // Get GeoIP info for an IP (from cache)
  getIPGeolocation(ip: string): { 
    country: string; 
    country_name: string; 
    city: string;
    asn: string;
    as_name: string;
    as_domain: string;
    continent: string;
    continent_name: string;
  } | undefined {
    const stmt = this.db.prepare(`
      SELECT country, country_name, city, asn, as_name, as_domain, continent, continent_name 
      FROM geoip_cache 
      WHERE ip = ?
    `);
    return stmt.get(ip) as { 
      country: string; 
      country_name: string; 
      city: string;
      asn: string;
      as_name: string;
      as_domain: string;
      continent: string;
      continent_name: string;
    } | undefined;
  }

  // Save GeoIP info to cache
  saveIPGeolocation(ip: string, geo: {
    country: string;
    country_name: string;
    city: string;
    asn: string;
    as_name: string;
    as_domain: string;
    continent: string;
    continent_name: string;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO geoip_cache (ip, country, country_name, city, asn, as_name, as_domain, continent, continent_name, queried_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(ip) DO UPDATE SET
        country = ?,
        country_name = ?,
        city = ?,
        asn = ?,
        as_name = ?,
        as_domain = ?,
        continent = ?,
        continent_name = ?,
        queried_at = CURRENT_TIMESTAMP
    `);
    stmt.run(
      ip, geo.country, geo.country_name, geo.city, geo.asn, geo.as_name, geo.as_domain, geo.continent, geo.continent_name,
      geo.country, geo.country_name, geo.city, geo.asn, geo.as_name, geo.as_domain, geo.continent, geo.continent_name
    );
  }

  // Get summary stats for a specific backend
  getSummary(backendId: number): { totalConnections: number; totalUpload: number; totalDownload: number; uniqueDomains: number; uniqueIPs: number } {
    // Calculate totals from domain_stats (aggregated data) instead of connection_logs
    // This is more efficient and works with batch writing
    const trafficStmt = this.db.prepare(`
      SELECT 
        COALESCE(SUM(total_connections), 0) as connections,
        COALESCE(SUM(total_upload), 0) as upload, 
        COALESCE(SUM(total_download), 0) as download
      FROM domain_stats 
      WHERE backend_id = ?
    `);
    const { connections, upload, download } = trafficStmt.get(backendId) as { 
      connections: number; 
      upload: number; 
      download: number;
    };

    const domainsStmt = this.db.prepare(`
      SELECT COUNT(DISTINCT domain) as count FROM domain_stats WHERE backend_id = ?
    `);
    const uniqueDomains = (domainsStmt.get(backendId) as { count: number }).count;

    const ipsStmt = this.db.prepare(`
      SELECT COUNT(DISTINCT ip) as count FROM ip_stats WHERE backend_id = ?
    `);
    const uniqueIPs = (ipsStmt.get(backendId) as { count: number }).count;

    return {
      totalConnections: connections,
      totalUpload: upload,
      totalDownload: download,
      uniqueDomains,
      uniqueIPs
    };
  }

  // Get per-proxy traffic breakdown for a specific domain
  getDomainProxyStats(backendId: number, domain: string): ProxyTrafficStats[] {
    const stmt = this.db.prepare(`
      SELECT chain, 
             SUM(upload) as totalUpload, 
             SUM(download) as totalDownload, 
             COUNT(*) as totalConnections
      FROM connection_logs
      WHERE backend_id = ? AND domain = ?
      GROUP BY chain
      ORDER BY (SUM(upload) + SUM(download)) DESC
    `);
    return stmt.all(backendId, domain) as ProxyTrafficStats[];
  }

  // Get per-proxy traffic breakdown for a specific IP
  getIPProxyStats(backendId: number, ip: string): ProxyTrafficStats[] {
    const stmt = this.db.prepare(`
      SELECT chain, 
             SUM(upload) as totalUpload, 
             SUM(download) as totalDownload, 
             COUNT(*) as totalConnections
      FROM connection_logs
      WHERE backend_id = ? AND ip = ?
      GROUP BY chain
      ORDER BY (SUM(upload) + SUM(download)) DESC
    `);
    return stmt.all(backendId, ip) as ProxyTrafficStats[];
  }

  // Get domains for a specific proxy/node
  getProxyDomains(backendId: number, chain: string, limit = 50): DomainStats[] {
    // First get domains from connection_logs
    const stmt = this.db.prepare(`
      SELECT 
        domain,
        SUM(upload) as totalUpload,
        SUM(download) as totalDownload,
        COUNT(*) as totalConnections,
        MAX(timestamp) as lastSeen,
        GROUP_CONCAT(DISTINCT ip) as ips
      FROM connection_logs
      WHERE backend_id = ? AND chain = ? AND domain IS NOT NULL AND domain != 'unknown'
      GROUP BY domain
      ORDER BY (SUM(upload) + SUM(download)) DESC
      LIMIT ?
    `);
    const rows = stmt.all(backendId, chain, limit) as Array<{
      domain: string;
      totalUpload: number;
      totalDownload: number;
      totalConnections: number;
      lastSeen: string;
      ips: string | null;
    }>;
    
    return rows.map(row => ({
      ...row,
      ips: row.ips ? row.ips.split(',').filter(Boolean) : [],
      rules: [],
      chains: [chain],
    })) as DomainStats[];
  }

  // Get IPs for a specific proxy/node
  getProxyIPs(backendId: number, chain: string, limit = 50): IPStats[] {
    // First get IPs from connection_logs
    const stmt = this.db.prepare(`
      SELECT 
        ip,
        SUM(upload) as totalUpload,
        SUM(download) as totalDownload,
        COUNT(*) as totalConnections,
        MAX(timestamp) as lastSeen,
        GROUP_CONCAT(DISTINCT domain) as domains
      FROM connection_logs
      WHERE backend_id = ? AND chain = ?
      GROUP BY ip
      ORDER BY (SUM(upload) + SUM(download)) DESC
      LIMIT ?
    `);
    const rows = stmt.all(backendId, chain, limit) as Array<{
      ip: string;
      totalUpload: number;
      totalDownload: number;
      totalConnections: number;
      lastSeen: string;
      domains: string | null;
    }>;
    
    // Get geoIP info for each IP
    const ipList = rows.map(r => r.ip);
    if (ipList.length === 0) {
      return [];
    }
    
    const placeholders = ipList.map(() => '?').join(',');
    const geoStmt = this.db.prepare(`
      SELECT 
        ip,
        CASE 
          WHEN country IS NOT NULL THEN 
            json_array(
              country,
              COALESCE(country_name, country),
              COALESCE(city, ''),
              COALESCE(as_name, '')
            )
          ELSE 
            NULL
        END as geoIP
      FROM geoip_cache
      WHERE ip IN (${placeholders})
    `);
    const geoRows = geoStmt.all(...ipList) as Array<{
      ip: string;
      geoIP: string | null;
    }>;
    
    const geoMap = new Map(geoRows.map(r => [r.ip, r.geoIP]));
    
    return rows.map(row => ({
      ...row,
      domains: row.domains ? row.domains.split(',').filter(Boolean) : [],
      chains: [chain],
      geoIP: geoMap.get(row.ip) ? JSON.parse(geoMap.get(row.ip)!).filter(Boolean) : undefined,
    })) as IPStats[];
  }

  // Get recent connections for a specific backend
  getRecentConnections(backendId: number, limit = 100): Connection[] {
    const stmt = this.db.prepare(`
      SELECT id, domain, ip, chain, upload, download, timestamp
      FROM connection_logs
      WHERE backend_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    return stmt.all(backendId, limit) as Connection[];
  }

  // Clean old data for a specific backend (or all backends if backendId is null)
  // days=0 means clear all data (no time limit)
  cleanupOldData(backendId: number | null, days: number): { deletedConnections: number; deletedLogs: number; deletedDomains: number; deletedIPs: number; deletedProxies: number; deletedRules: number } {
    let deletedConnections = 0;
    let deletedLogs = 0;
    let deletedDomains = 0;
    let deletedIPs = 0;
    let deletedProxies = 0;
    let deletedRules = 0;

    if (backendId !== null) {
      // Clean specific backend
      if (days === 0) {
        // Clear all data for this backend
        const connectionsStmt = this.db.prepare(`DELETE FROM connection_logs WHERE backend_id = ?`);
        const result = connectionsStmt.run(backendId);
        deletedConnections = result.changes;
        deletedLogs = result.changes;

        // Clear stats tables
        const domainsStmt = this.db.prepare(`DELETE FROM domain_stats WHERE backend_id = ?`);
        deletedDomains = domainsStmt.run(backendId).changes;

        const ipsStmt = this.db.prepare(`DELETE FROM ip_stats WHERE backend_id = ?`);
        deletedIPs = ipsStmt.run(backendId).changes;

        const proxiesStmt = this.db.prepare(`DELETE FROM proxy_stats WHERE backend_id = ?`);
        deletedProxies = proxiesStmt.run(backendId).changes;

        const rulesStmt = this.db.prepare(`DELETE FROM rule_stats WHERE backend_id = ?`);
        deletedRules = rulesStmt.run(backendId).changes;
      } else {
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        const connectionsStmt = this.db.prepare(`DELETE FROM connection_logs WHERE backend_id = ? AND timestamp < ?`);
        const result = connectionsStmt.run(backendId, cutoff);
        deletedConnections = result.changes;
        deletedLogs = result.changes;
        // For partial cleanup, we keep the stats tables as they are aggregated data
      }
    } else {
      // Clean all backends
      if (days === 0) {
        // Clear all data
        const connectionsStmt = this.db.prepare(`DELETE FROM connection_logs`);
        const result = connectionsStmt.run();
        deletedConnections = result.changes;
        deletedLogs = result.changes;

        // Clear all stats tables
        const domainsStmt = this.db.prepare(`DELETE FROM domain_stats`);
        deletedDomains = domainsStmt.run().changes;

        const ipsStmt = this.db.prepare(`DELETE FROM ip_stats`);
        deletedIPs = ipsStmt.run().changes;

        const proxiesStmt = this.db.prepare(`DELETE FROM proxy_stats`);
        deletedProxies = proxiesStmt.run().changes;

        const rulesStmt = this.db.prepare(`DELETE FROM rule_stats`);
        deletedRules = rulesStmt.run().changes;
      } else {
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        const connectionsStmt = this.db.prepare(`DELETE FROM connection_logs WHERE timestamp < ?`);
        const result = connectionsStmt.run(cutoff);
        deletedConnections = result.changes;
        deletedLogs = result.changes;
        // For partial cleanup, we keep the stats tables as they are aggregated data
      }
    }

    // Vacuum database to reclaim space after clearing all data
    if (days === 0) {
      this.vacuum();
    }

    return { deletedConnections, deletedLogs, deletedDomains, deletedIPs, deletedProxies, deletedRules };
  }

  // Clean old ASN cache entries
  cleanupASNCache(days: number): number {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const stmt = this.db.prepare(`DELETE FROM asn_cache WHERE queried_at < ?`);
    const result = stmt.run(cutoff);
    return result.changes;
  }

  // Get database file size in bytes
  getDatabaseSize(): number {
    try {
      const stats = fs.statSync(this.dbPath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  // Get connection logs count for a specific backend
  getConnectionLogsCount(backendId: number): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM connection_logs WHERE backend_id = ?
    `);
    const result = stmt.get(backendId) as { count: number };
    return result.count;
  }

  // Get total connection logs count (all backends)
  getTotalConnectionLogsCount(): number {
    const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM connection_logs`);
    const result = stmt.get() as { count: number };
    return result.count;
  }

  // Retention Configuration Methods

  // Get retention configuration
  getRetentionConfig(): DatabaseRetentionConfig {
    const connectionLogsDays = this.db.prepare(`
      SELECT value FROM app_config WHERE key = 'retention.connection_logs_days'
    `).get() as { value: string } | undefined;

    const hourlyStatsDays = this.db.prepare(`
      SELECT value FROM app_config WHERE key = 'retention.hourly_stats_days'
    `).get() as { value: string } | undefined;

    const autoCleanup = this.db.prepare(`
      SELECT value FROM app_config WHERE key = 'retention.auto_cleanup'
    `).get() as { value: string } | undefined;

    return {
      connectionLogsDays: parseInt(connectionLogsDays?.value || '7', 10),
      hourlyStatsDays: parseInt(hourlyStatsDays?.value || '30', 10),
      autoCleanup: autoCleanup?.value === '1',
    };
  }

  // Update retention configuration
  updateRetentionConfig(updates: {
    connectionLogsDays?: number;
    hourlyStatsDays?: number;
    autoCleanup?: boolean;
  }): DatabaseRetentionConfig {
    if (updates.connectionLogsDays !== undefined) {
      this.db.prepare(`
        INSERT INTO app_config (key, value) VALUES ('retention.connection_logs_days', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `).run(updates.connectionLogsDays.toString());
    }

    if (updates.hourlyStatsDays !== undefined) {
      this.db.prepare(`
        INSERT INTO app_config (key, value) VALUES ('retention.hourly_stats_days', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `).run(updates.hourlyStatsDays.toString());
    }

    if (updates.autoCleanup !== undefined) {
      this.db.prepare(`
        INSERT INTO app_config (key, value) VALUES ('retention.auto_cleanup', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `).run(updates.autoCleanup ? '1' : '0');
    }

    return this.getRetentionConfig();
  }

  // Backend Management Methods

  // Create a new backend configuration
  createBackend(backend: { name: string; url: string; token?: string }): number {
    const stmt = this.db.prepare(`
      INSERT INTO backend_configs (name, url, token, enabled, is_active, listening)
      VALUES (?, ?, ?, 1, 0, 1)
    `);
    const result = stmt.run(backend.name, backend.url, backend.token || '');
    return Number(result.lastInsertRowid);
  }

  // Get all backend configurations
  getAllBackends(): BackendConfig[] {
    const stmt = this.db.prepare(`
      SELECT id, name, url, token, enabled, is_active, listening, created_at, updated_at
      FROM backend_configs
      ORDER BY created_at ASC
    `);
    return stmt.all() as BackendConfig[];
  }

  // Get a backend by ID
  getBackend(id: number): BackendConfig | undefined {
    const stmt = this.db.prepare(`
      SELECT id, name, url, token, enabled, is_active, listening, created_at, updated_at
      FROM backend_configs
      WHERE id = ?
    `);
    return stmt.get(id) as BackendConfig | undefined;
  }

  // Get the currently active backend
  getActiveBackend(): BackendConfig | undefined {
    const stmt = this.db.prepare(`
      SELECT id, name, url, token, enabled, is_active, listening, created_at, updated_at
      FROM backend_configs
      WHERE is_active = 1
      LIMIT 1
    `);
    return stmt.get() as BackendConfig | undefined;
  }

  // Get all backends that should be listening (collecting data)
  getListeningBackends(): BackendConfig[] {
    const stmt = this.db.prepare(`
      SELECT id, name, url, token, enabled, is_active, listening, created_at, updated_at
      FROM backend_configs
      WHERE listening = 1 AND enabled = 1
    `);
    return stmt.all() as BackendConfig[];
  }

  // Update a backend configuration
  updateBackend(id: number, updates: Partial<Omit<BackendConfig, 'id' | 'created_at'>>): void {
    const sets: string[] = [];
    const values: (string | number | boolean)[] = [];

    if (updates.name !== undefined) {
      sets.push('name = ?');
      values.push(updates.name);
    }
    if (updates.url !== undefined) {
      sets.push('url = ?');
      values.push(updates.url);
    }
    if (updates.token !== undefined) {
      sets.push('token = ?');
      values.push(updates.token);
    }
    if (updates.enabled !== undefined) {
      sets.push('enabled = ?');
      values.push(updates.enabled ? 1 : 0);
    }
    if (updates.listening !== undefined) {
      sets.push('listening = ?');
      values.push(updates.listening ? 1 : 0);
    }
    if (updates.is_active !== undefined) {
      sets.push('is_active = ?');
      values.push(updates.is_active ? 1 : 0);
    }

    if (sets.length === 0) return;

    sets.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE backend_configs
      SET ${sets.join(', ')}
      WHERE id = ?
    `);
    stmt.run(...values);
  }

  // Set a backend as active (for display) - unsets all others
  setActiveBackend(id: number): void {
    this.db.exec('BEGIN TRANSACTION');
    try {
      // Unset all backends as active
      this.db.prepare(`UPDATE backend_configs SET is_active = 0`).run();
      // Set the specified backend as active
      this.db.prepare(`UPDATE backend_configs SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  // Set listening state for a backend (controls data collection)
  setBackendListening(id: number, listening: boolean): void {
    const stmt = this.db.prepare(`
      UPDATE backend_configs
      SET listening = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(listening ? 1 : 0, id);
  }

  // Delete a backend and all its associated data
  deleteBackend(id: number): void {
    // Due to ON DELETE CASCADE, all associated stats will be deleted automatically
    const stmt = this.db.prepare(`DELETE FROM backend_configs WHERE id = ?`);
    stmt.run(id);
  }

  // Delete all data for a specific backend
  deleteBackendData(id: number): void {
    this.db.exec('BEGIN TRANSACTION');
    try {
      this.db.prepare(`DELETE FROM domain_stats WHERE backend_id = ?`).run(id);
      this.db.prepare(`DELETE FROM ip_stats WHERE backend_id = ?`).run(id);
      this.db.prepare(`DELETE FROM proxy_stats WHERE backend_id = ?`).run(id);
      this.db.prepare(`DELETE FROM rule_stats WHERE backend_id = ?`).run(id);
      this.db.prepare(`DELETE FROM rule_proxy_map WHERE backend_id = ?`).run(id);
      this.db.prepare(`DELETE FROM country_stats WHERE backend_id = ?`).run(id);
      this.db.prepare(`DELETE FROM hourly_stats WHERE backend_id = ?`).run(id);
      this.db.prepare(`DELETE FROM connection_logs WHERE backend_id = ?`).run(id);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  // Get total stats across all backends
  getGlobalSummary(): { totalConnections: number; totalUpload: number; totalDownload: number; uniqueDomains: number; uniqueIPs: number; backendCount: number } {
    // Calculate totals from domain_stats (aggregated data) instead of connection_logs
    const trafficStmt = this.db.prepare(`
      SELECT 
        COALESCE(SUM(total_connections), 0) as connections,
        COALESCE(SUM(total_upload), 0) as upload, 
        COALESCE(SUM(total_download), 0) as download
      FROM domain_stats
    `);
    const { connections, upload, download } = trafficStmt.get() as { 
      connections: number; 
      upload: number; 
      download: number;
    };

    const domainsStmt = this.db.prepare(`
      SELECT COUNT(DISTINCT domain) as count FROM domain_stats
    `);
    const uniqueDomains = (domainsStmt.get() as { count: number }).count;

    const ipsStmt = this.db.prepare(`
      SELECT COUNT(DISTINCT ip) as count FROM ip_stats
    `);
    const uniqueIPs = (ipsStmt.get() as { count: number }).count;

    const backendStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM backend_configs
    `);
    const backendCount = (backendStmt.get() as { count: number }).count;

    return {
      totalConnections: connections,
      totalUpload: upload,
      totalDownload: download,
      uniqueDomains,
      uniqueIPs,
      backendCount
    };
  }

  vacuum(): void {
    this.db.exec('VACUUM');
  }

  // Cleanup methods for data retention
  deleteOldConnectionLogs(cutoff: string): number {
    const stmt = this.db.prepare(`
      DELETE FROM connection_logs WHERE timestamp < ?
    `);
    return stmt.run(cutoff).changes;
  }

  deleteOldHourlyStats(cutoff: string): number {
    const stmt = this.db.prepare(`
      DELETE FROM hourly_stats WHERE hour < ?
    `);
    return stmt.run(cutoff).changes;
  }

  getCleanupStats(): {
    connectionLogsCount: number;
    hourlyStatsCount: number;
    oldestConnectionLog: string | null;
    oldestHourlyStat: string | null;
  } {
    const logsCountStmt = this.db.prepare('SELECT COUNT(*) as count FROM connection_logs');
    const hourlyCountStmt = this.db.prepare('SELECT COUNT(*) as count FROM hourly_stats');
    const oldestLogStmt = this.db.prepare('SELECT MIN(timestamp) as ts FROM connection_logs');
    const oldestHourlyStmt = this.db.prepare('SELECT MIN(hour) as hr FROM hourly_stats');

    return {
      connectionLogsCount: (logsCountStmt.get() as { count: number }).count,
      hourlyStatsCount: (hourlyCountStmt.get() as { count: number }).count,
      oldestConnectionLog: (oldestLogStmt.get() as { ts: string | null })?.ts || null,
      oldestHourlyStat: (oldestHourlyStmt.get() as { hr: string | null })?.hr || null,
    };
  }

  close() {
    this.db.close();
  }
}

export default StatsDatabase;
