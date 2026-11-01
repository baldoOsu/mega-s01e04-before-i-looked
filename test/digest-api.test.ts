import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

describe('GET /api/digest/:night', () => {
  const app = createApp(loadConfig());

  it('returns the reader rows as JSON', async () => {
    const res = await app.request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { night: string; rows: { job: string }[]; badLines: number };
    expect(body.night).toBe('2026-10-28');
    expect(body.rows.length).toBeGreaterThan(0);
    expect(body.rows.map((r) => r.job)).toEqual([...body.rows.map((r) => r.job)].sort());
  });

  it('404s for a night with no file', async () => {
    const res = await app.request('/api/digest/2099-01-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log', night: '2099-01-01' });
  });
});
