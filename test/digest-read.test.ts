import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';
import type { DigestRow, Night } from '../src/digest/types.js';

function row(night: Night | null, job: string): DigestRow {
  const r = night?.rows.find((x) => x.job === job);
  if (!r) throw new Error(`no row for ${job}`);
  return r;
}

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');

  it('finds 5 jobs, sorted by job, and 1 bad line', () => {
    expect(night?.night).toBe('2026-10-28');
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night?.badLines).toBe(1);
  });

  it('counts retries and keeps the last error seen after a recovery', () => {
    expect(row(night, 'fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      fails: 0,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    const sync = row(night, 'lane/sync');
    expect(sync).toMatchObject({ runs: 8, retries: 1, lastStatus: 'ok', lastError: 'lock held' });
  });

  it('keeps a row whose owner is null', () => {
    expect(row(night, 'digest/render')).toMatchObject({ owner: null, runs: 1, lastStatus: 'ok', lastError: null });
  });

  it('reports a failed job with its error', () => {
    expect(row(night, 'notes/backup')).toMatchObject({
      owner: 'lane-07',
      runs: 1,
      fails: 1,
      lastStatus: 'fail',
      lastError: 'quota exceeded',
    });
  });

  it('keeps the log offset on times', () => {
    for (const r of night?.rows ?? []) {
      expect(r.firstAt).toMatch(/\+01:00$/);
      expect(r.lastAt).toMatch(/\+01:00$/);
    }
    expect(row(night, 'lane/sync')).toMatchObject({
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
  });
});

describe('readNight on a temp runs dir', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const put = (night: string, body: string) => writeFileSync(join(dir, `${night}.jsonl`), body);

  it('returns null when the night has no file', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('returns null for a night that is not YYYY-MM-DD', () => {
    put('2026-01-01', '');
    expect(readNight(dir, '../2026-01-01')).toBeNull();
    expect(readNight(dir, '2026-01-01.jsonl')).toBeNull();
    expect(readNight(dir, '')).toBeNull();
  });

  it('reads an empty file as a night where nothing ran', () => {
    put('2026-01-01', '');
    expect(readNight(dir, '2026-01-01')).toEqual({ night: '2026-01-01', rows: [], badLines: 0 });
  });

  it('counts every garbage line and never throws', () => {
    put(
      '2026-01-01',
      [
        'not json',
        '{"at":"2026-01-01T01:00:00+01:00","job":"a"',
        '[]',
        'null',
        '42',
        '{"job":"a","status":"ok"}',
        '{"at":"yesterday","job":"a","status":"ok"}',
        '{"at":"2026-01-01T01:00:00","job":"a","status":"ok"}',
        '{"at":"2026-01-01T01:00:00+01:00","job":"","status":"ok"}',
        '{"at":"2026-01-01T01:00:00+01:00","job":"a","status":"done"}',
        '{"at":"2026-01-01T01:00:00+01:00","job":"a","status":"ok","owner":7}',
        '{"at":"2026-01-01T01:00:00+01:00","job":"a","status":"fail","error":{"code":1}}',
        '',
        '   ',
      ].join('\n'),
    );
    expect(readNight(dir, '2026-01-01')).toEqual({ night: '2026-01-01', rows: [], badLines: 12 });
  });

  it('orders by at, not by file position, and breaks ties by file order', () => {
    put(
      '2026-01-02',
      [
        '{"at":"2026-01-02T03:00:00+01:00","job":"j","status":"ok","owner":"rook"}',
        '{"at":"2026-01-02T01:00:00+01:00","job":"j","status":"retry","owner":"rook","error":"early"}',
        // Same instant as the first line, written in UTC: later in the file, so it wins the tie.
        '{"at":"2026-01-02T02:00:00Z","job":"j","status":"fail","owner":null,"error":"tied"}',
      ].join('\n'),
    );
    expect(readNight(dir, '2026-01-02')?.rows).toEqual([
      {
        job: 'j',
        owner: 'rook',
        runs: 3,
        retries: 1,
        fails: 1,
        lastStatus: 'fail',
        lastError: 'tied',
        firstAt: '2026-01-02T01:00:00+01:00',
        lastAt: '2026-01-02T02:00:00Z',
      },
    ]);
  });
});
