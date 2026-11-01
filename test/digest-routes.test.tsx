import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow, Night } from '../src/digest/types.js';

// Plan morning-digest § 2d. Written against the contract in the brief: the page route (#2) and
// the JSON route (#3). Everything goes through app.request(); the runs dir is a temp dir.

const NORMAL = '2026-10-30';
const BAD = '2026-10-29';
const EMPTY = '2026-10-31';
const MISSING = '2026-10-28';

// Lines are out of order on purpose: the reader sorts by job, not by file position.
const NORMAL_LINES = [
  '{"at":"2026-10-30T23:00:02+01:00","job":"rig/rotate-logs","status":"ok","owner":"lane-07"}',
  '{"at":"2026-10-30T01:00:05+01:00","job":"lane/sync","status":"retry","owner":"rook","error":"lock held"}',
  '{"at":"2026-10-30T01:30:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
  '{"at":"2026-10-30T01:31:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
  '{"at":"2026-10-30T01:33:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
  '{"at":"2026-10-30T01:37:00+01:00","job":"fixtures/refresh","status":"ok","owner":"rook"}',
  '{"at":"2026-10-30T02:00:33+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
  '{"at":"2026-10-30T04:00:01+01:00","job":"notes/backup","status":"fail","owner":"lane-07","error":"quota exceeded"}',
  '{"at":"2026-10-30T05:41:09+01:00","job":"digest/render","status":"ok","owner":null}',
];

const BAD_LINES = [
  '{"at":"2026-10-29T03:00:00+01:00","job":"notes/backup","status":"fail","owner":"lane-07","error":"quota exceeded"}',
  '{"at":"2026-10-29T02:00:00+01:00","job":"lane/sync","sta',
  '{"at":"2026-10-29T01:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
];

// What the reader returns for NORMAL_LINES, in job order.
const NORMAL_ROWS: DigestRow[] = [
  {
    job: 'digest/render',
    owner: null,
    runs: 1,
    retries: 0,
    fails: 0,
    lastStatus: 'ok',
    lastError: null,
    firstAt: '2026-10-30T05:41:09+01:00',
    lastAt: '2026-10-30T05:41:09+01:00',
  },
  {
    job: 'fixtures/refresh',
    owner: 'rook',
    runs: 4,
    retries: 3,
    fails: 0,
    lastStatus: 'ok',
    lastError: 'upstream 503',
    firstAt: '2026-10-30T01:30:00+01:00',
    lastAt: '2026-10-30T01:37:00+01:00',
  },
  {
    job: 'lane/sync',
    owner: 'rook',
    runs: 2,
    retries: 1,
    fails: 0,
    lastStatus: 'ok',
    lastError: 'lock held',
    firstAt: '2026-10-30T01:00:05+01:00',
    lastAt: '2026-10-30T02:00:33+01:00',
  },
  {
    job: 'notes/backup',
    owner: 'lane-07',
    runs: 1,
    retries: 0,
    fails: 1,
    lastStatus: 'fail',
    lastError: 'quota exceeded',
    firstAt: '2026-10-30T04:00:01+01:00',
    lastAt: '2026-10-30T04:00:01+01:00',
  },
  {
    job: 'rig/rotate-logs',
    owner: 'lane-07',
    runs: 1,
    retries: 0,
    fails: 0,
    lastStatus: 'ok',
    lastError: null,
    firstAt: '2026-10-30T23:00:02+01:00',
    lastAt: '2026-10-30T23:00:02+01:00',
  },
];

const WARN_JOBS = ['fixtures/refresh', 'notes/backup'];
const HEADERS = ['job', 'owner', 'runs', 'retries', 'last status', 'last error', 'first', 'last'];

type ErrorBody = { error: string; night: string };

// The <tr> chunk for one job's row (split on the opening tag, so the chunk starts with its attributes).
function trFor(html: string, job: string): string {
  const chunk = html.split('<tr').find((c) => c.includes(`>${job}<`));
  if (chunk === undefined) throw new Error(`no <tr> for ${job}`);
  return chunk;
}

// Attributes of a job's <tr>: ' class="warn"' or ''.
function trAttrs(html: string, job: string): string {
  const chunk = trFor(html, job);
  return chunk.slice(0, chunk.indexOf('>'));
}

function jobOrderOnPage(html: string, jobs: string[]): number[] {
  return jobs.map((j) => html.indexOf(`>${j}<`));
}

let dir: string;
let prevLaneId: string | undefined;
let prevMarker: string | undefined;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  writeFileSync(join(dir, `${NORMAL}.jsonl`), NORMAL_LINES.join('\n') + '\n');
  writeFileSync(join(dir, `${BAD}.jsonl`), BAD_LINES.join('\n') + '\n');
  writeFileSync(join(dir, `${EMPTY}.jsonl`), '');

  prevLaneId = process.env.LANE_ID;
  prevMarker = process.env.LANE_MARKER;
  process.env.LANE_ID = 'lane-07';
  process.env.LANE_MARKER = 'TEST-MARKER';
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  if (prevLaneId === undefined) delete process.env.LANE_ID;
  else process.env.LANE_ID = prevLaneId;
  if (prevMarker === undefined) delete process.env.LANE_MARKER;
  else process.env.LANE_MARKER = prevMarker;
});

const app = () =>
  createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir });

describe('GET /digest/:night', () => {
  it('200 with the layout, the title, and one table with the eight columns', async () => {
    const res = await app().request(`/digest/${NORMAL}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain(`<title>rig · digest · ${NORMAL}</title>`);
    expect(html).toContain('lane-07');
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain(`<h1>digest · ${NORMAL}</h1>`);
    expect(html.split('<table').length - 1).toBe(1);
    const headers = [...html.matchAll(/<th\b[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
    expect(headers).toEqual(HEADERS);
  });

  it('renders one row per job, in job order, with the log times and last error', async () => {
    const html = await (await app().request(`/digest/${NORMAL}`)).text();
    const jobs = NORMAL_ROWS.map((r) => r.job);
    const at = jobOrderOnPage(html, jobs);
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    for (const r of NORMAL_ROWS) {
      const tr = trFor(html, r.job);
      expect(tr).toContain(r.firstAt);
      expect(tr).toContain(r.lastAt);
      expect(tr).toContain(r.lastError ?? '—');
    }
  });

  it('marks retries of 3 or more and any fail with class warn, and nothing else', async () => {
    const html = await (await app().request(`/digest/${NORMAL}`)).text();
    for (const job of WARN_JOBS) expect(trAttrs(html, job)).toContain('class="warn"');
    for (const job of ['digest/render', 'lane/sync', 'rig/rotate-logs']) {
      expect(trAttrs(html, job)).not.toContain('warn');
    }
  });

  it('renders a null owner as —', async () => {
    const html = await (await app().request(`/digest/${NORMAL}`)).text();
    const cells = [...trFor(html, 'digest/render').matchAll(/<td\b[^>]*>([^<]*)<\/td>/g)].map((m) => m[1]);
    // Column 2 is owner (job, owner, ...).
    expect(cells[1]).toBe('—');
    expect(cells).not.toContain('null');
  });

  it('404 with the layout for a night with no file', async () => {
    const res = await app().request(`/digest/${MISSING}`);
    const html = await res.text();
    expect(res.status).toBe(404);
    expect(html).toContain('<main>');
    expect(html).toContain(`<p>no run log for ${MISSING}</p>`);
  });

  it('404 for a night that is not YYYY-MM-DD', async () => {
    const res = await app().request('/digest/2026-1-1');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('<p>no run log for 2026-1-1</p>');
  });

  it('renders "nothing ran" and no table for an empty night, with status 200', async () => {
    const res = await app().request(`/digest/${EMPTY}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table');
  });

  it('keeps the rows of a night with a bad line and says how many lines were unread', async () => {
    const res = await app().request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('1 line(s) could not be read');
    expect(html).toContain('<table');
    expect(trFor(html, 'lane/sync')).toContain('2026-10-29T01:00:00+01:00');
    expect(trAttrs(html, 'notes/backup')).toContain('class="warn"');
  });

  it('does not mention unread lines when every line parsed', async () => {
    const html = await (await app().request(`/digest/${NORMAL}`)).text();
    expect(html).not.toContain('could not be read');
  });
});

describe('GET /api/digest/:night', () => {
  it('200 with the rows exactly as the reader returns them', async () => {
    const res = await app().request(`/api/digest/${NORMAL}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body).toEqual({ night: NORMAL, rows: NORMAL_ROWS, badLines: 0 });
  });

  it('404 with an error body for a night with no file', async () => {
    const res = await app().request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect((await res.json()) as ErrorBody).toEqual({ error: 'no run log', night: MISSING });
  });

  it('404 with an error body for a night that is not YYYY-MM-DD', async () => {
    const res = await app().request('/api/digest/2026-1-1');
    expect(res.status).toBe(404);
    expect((await res.json()) as ErrorBody).toEqual({ error: 'no run log', night: '2026-1-1' });
  });

  it('empty night: rows [] and badLines 0, with status 200', async () => {
    const res = await app().request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect((await res.json()) as Night).toEqual({ night: EMPTY, rows: [], badLines: 0 });
  });

  it('bad-line night: the row is still there and badLines is 1', async () => {
    const res = await app().request(`/api/digest/${BAD}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['lane/sync', 'notes/backup']);
    expect(body.rows[1]).toMatchObject({ job: 'notes/backup', fails: 1, lastStatus: 'fail' });
  });
});

describe('page and JSON agree', () => {
  it.each([NORMAL, BAD, EMPTY])('%s: same jobs in the same order on the page and in the JSON', async (night) => {
    const json = (await (await app().request(`/api/digest/${night}`)).json()) as Night;
    const html = await (await app().request(`/digest/${night}`)).text();
    const jobs = json.rows.map((r) => r.job);
    if (jobs.length === 0) {
      expect(html).toContain('nothing ran');
      return;
    }
    const at = jobOrderOnPage(html, jobs);
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
});
