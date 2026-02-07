/**
 * Data Retention Policy for Clash Master
 * 
 * Tiered storage strategy:
 * - Raw data (connection_logs): 7 days for detailed analysis
 * - Hourly aggregates: 30 days for recent trends
 * - Daily aggregates: 90 days for monthly analysis
 * - Domain/IP stats: Permanent (continuously updated)
 */

export interface RetentionConfig {
  // Raw connection logs retention (detailed per-connection data)
  connectionLogsDays: number;
  
  // Hourly stats retention (for traffic trend charts)
  hourlyStatsDays: number;
  
  // Auto-cleanup enabled
  autoCleanup: boolean;
  
  // Cleanup interval (hours)
  cleanupInterval: number;
}

export const DEFAULT_RETENTION: RetentionConfig = {
  connectionLogsDays: 7,      // Keep 7 days of raw logs
  hourlyStatsDays: 30,        // Keep 30 days of hourly data
  autoCleanup: true,
  cleanupInterval: 24,        // Run cleanup every 24 hours
};

// For users who want longer retention (higher storage cost)
export const EXTENDED_RETENTION: RetentionConfig = {
  connectionLogsDays: 30,     // Keep 30 days of raw logs
  hourlyStatsDays: 90,        // Keep 90 days of hourly data
  autoCleanup: true,
  cleanupInterval: 24,
};

// Minimal retention for low-resource environments
export const MINIMAL_RETENTION: RetentionConfig = {
  connectionLogsDays: 3,      // Keep 3 days of raw logs
  hourlyStatsDays: 14,        // Keep 14 days of hourly data
  autoCleanup: true,
  cleanupInterval: 12,        // Cleanup more frequently
};
