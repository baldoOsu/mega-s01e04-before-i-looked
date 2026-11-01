import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight } from './digest/read.js';
import { lastBeat, type Beat } from './heartbeat.js';

// Line counts for one night, summed over its jobs. ok = runs - retries - fails.
export type NightCounts = { ok: number; retry: number; fail: number };

export type NightOnBoard = {
  night: string;
  // null when the night's log can't be read: rendered as `—`, never dropped.
  counts: NightCounts | null;
};

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightOnBoard[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

// Counts come from the digest reader, so the board and /digest/<night> always agree.
export function nightCounts(runsDir: string, night: string): NightCounts | null {
  let log;
  try {
    log = readNight(runsDir, night);
  } catch {
    // An unreadable file (permissions, a directory with a .jsonl name) must not take the board down.
    return null;
  }
  if (!log) return null;
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  for (const r of log.rows) {
    counts.retry += r.retries;
    counts.fail += r.fails;
    counts.ok += r.runs - r.retries - r.fails;
  }
  return counts;
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((night) => ({
      night,
      counts: nightCounts(config.runsDir, night),
    })),
  };
}
