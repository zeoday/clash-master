let warnedMissingWriter = false;
let warnedEnabled = false;

export function isClickHouseOnlyModeEnabled(): boolean {
  return process.env.CH_ONLY_MODE === '1';
}

export function shouldSkipSqliteStatsWrites(clickHouseWriterEnabled: boolean): boolean {
  if (!isClickHouseOnlyModeEnabled()) {
    return false;
  }

  if (!clickHouseWriterEnabled) {
    if (!warnedMissingWriter) {
      warnedMissingWriter = true;
      console.warn(
        '[Stats Write Mode] CH_ONLY_MODE=1 but CH writer is disabled; keep SQLite writes to avoid data loss',
      );
    }
    return false;
  }

  if (!warnedEnabled) {
    warnedEnabled = true;
    console.info(
      '[Stats Write Mode] CH_ONLY_MODE=1 enabled; skip SQLite traffic/country stats writes',
    );
  }

  return true;
}
