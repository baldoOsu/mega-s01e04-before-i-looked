import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';

const base = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60 };

describe('status board links each night to its digest', () => {
  it('links both nights on runs/ with their ok / retry / fail counts', async () => {
    const config: RigConfig = { ...base, runsDir: 'runs' };
    const html = await (await createApp(config).request('/')).text();
    // runs/2026-10-27.jsonl: 7 ok. runs/2026-10-28.jsonl: 10 ok, 4 retry, 1 fail, 1 bad line (not counted).
    expect(html).toContain('<a href="/digest/2026-10-27">2026-10-27</a>');
    expect(html).toContain('ok 7 · retry 0 · fail 0');
    expect(html).toContain('<a href="/digest/2026-10-28">2026-10-28</a>');
    expect(html).toContain('ok 10 · retry 4 · fail 1');
  });
});

describe('status board counts on a temp runs dir', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-board-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const board = async () => (await createApp({ ...base, runsDir: dir }).request('/')).text();

  it('shows 0 · 0 · 0 for an empty night, and leaves out bad lines', async () => {
    writeFileSync(join(dir, '2026-10-20.jsonl'), '');
    writeFileSync(
      join(dir, '2026-10-21.jsonl'),
      [
        '{"at":"2026-10-21T01:00:00+01:00","job":"a","status":"ok"}',
        'not json',
        '{"at":"2026-10-21T01:05:00+01:00","job":"a","status":"fail","error":"x"}',
        '{"at":"2026-10-21T01:10:00+01:00","job":"b","status":"retry"}',
        '',
      ].join('\n'),
    );
    const html = await board();
    expect(html).toContain('<a href="/digest/2026-10-20">2026-10-20</a>');
    expect(html).toContain('ok 0 · retry 0 · fail 0');
    expect(html).toContain('<a href="/digest/2026-10-21">2026-10-21</a>');
    expect(html).toContain('ok 1 · retry 1 · fail 1');
  });

  it('renders — for a night whose log cannot be read, and keeps the other nights', async () => {
    // A directory with a .jsonl name is listed by nightsOnDisk but cannot be read as a file.
    mkdirSync(join(dir, '2026-10-22.jsonl'));
    writeFileSync(join(dir, '2026-10-23.jsonl'), '{"at":"2026-10-23T01:00:00+01:00","job":"a","status":"ok"}\n');
    const res = await createApp({ ...base, runsDir: dir }).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<a href="/digest/2026-10-22">2026-10-22</a>');
    expect(html).toContain('ok — · retry — · fail —');
    expect(html).toContain('ok 1 · retry 0 · fail 0');
  });
});
