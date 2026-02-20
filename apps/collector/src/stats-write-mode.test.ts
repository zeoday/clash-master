import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('stats-write-mode', () => {
  const prevMode = process.env.CH_ONLY_MODE;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.CH_ONLY_MODE;
  });

  afterEach(() => {
    if (prevMode === undefined) {
      delete process.env.CH_ONLY_MODE;
    } else {
      process.env.CH_ONLY_MODE = prevMode;
    }
    vi.restoreAllMocks();
  });

  it('should keep sqlite writes when CH_ONLY_MODE is disabled', async () => {
    const mode = await import('./stats-write-mode.js');
    expect(mode.shouldSkipSqliteStatsWrites(true)).toBe(false);
    expect(mode.shouldSkipSqliteStatsWrites(false)).toBe(false);
  });

  it('should keep sqlite writes and warn when writer is disabled', async () => {
    process.env.CH_ONLY_MODE = '1';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mode = await import('./stats-write-mode.js');

    expect(mode.shouldSkipSqliteStatsWrites(false)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('should skip sqlite writes when writer is enabled', async () => {
    process.env.CH_ONLY_MODE = '1';
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const mode = await import('./stats-write-mode.js');

    expect(mode.shouldSkipSqliteStatsWrites(true)).toBe(true);
    expect(info).toHaveBeenCalledTimes(1);
  });
});
