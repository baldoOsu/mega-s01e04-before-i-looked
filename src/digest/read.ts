import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunStatus } from './types.js';

type Run = { at: string; ms: number; job: string; status: RunStatus; owner: string | null; error: string | null };

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
// ISO 8601 date-time with an explicit offset; the offset is what we keep for display.
const AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const STATUSES: readonly string[] = ['ok', 'retry', 'fail'] satisfies RunStatus[];

function isStatus(s: unknown): s is RunStatus {
  return typeof s === 'string' && STATUSES.includes(s);
}

// The edge: one log line in, a Run or null (bad line) out. Never throws.
function parseLine(line: string): Run | null {
  let v: unknown;
  try {
    v = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const { at, job, status, owner, error } = o;
  if (typeof at !== 'string' || !AT.test(at)) return null;
  const ms = Date.parse(at);
  if (!Number.isFinite(ms)) return null;
  if (typeof job !== 'string' || job === '') return null;
  if (!isStatus(status)) return null;
  if (owner !== undefined && owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && error !== null && typeof error !== 'string') return null;
  return { at, ms, job, status, owner: owner ?? null, error: error || null };
}

function toRow(runs: Run[]): DigestRow {
  const first = runs[0]!;
  const last = runs[runs.length - 1]!;
  let owner: string | null = null;
  let lastError: string | null = null;
  for (const r of runs) {
    if (r.owner !== null) owner = r.owner;
    if (r.error !== null) lastError = r.error;
  }
  return {
    job: first.job,
    owner,
    runs: runs.length,
    retries: runs.filter((r) => r.status === 'retry').length,
    fails: runs.filter((r) => r.status === 'fail').length,
    lastStatus: last.status,
    lastError,
    firstAt: first.at,
    lastAt: last.at,
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }

  const byJob = new Map<string, Run[]>();
  let badLines = 0;
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const run = parseLine(line);
    if (!run) {
      badLines++;
      continue;
    }
    const list = byJob.get(run.job);
    if (list) list.push(run);
    else byJob.set(run.job, [run]);
  }

  const rows = [...byJob.values()]
    // Array.prototype.sort is stable, so equal instants keep file order.
    .map((runs) => toRow(runs.sort((a, b) => a.ms - b.ms)))
    .sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, badLines };
};
