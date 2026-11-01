import { describe, expect, it, vi } from 'vitest';
import { readNight } from '../src/digest/read.js';
import { createApp } from '../src/app.js';

vi.mock('../src/digest/read.js', () => ({ readNight: vi.fn() }));

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('2026-10-28');
    expect(html).toContain('<a href="/digest/2026-10-27">2026-10-27</a>');
    expect(html).toContain('<a href="/digest/2026-10-28">2026-10-28</a>');
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });

  it('shows each night\'s own counts, and — when the night cannot be read', async () => {
    vi.mocked(readNight).mockImplementation((_dir, night) =>
      night === '2026-10-28'
        ? { night, rows: [], badLines: 0, counts: { ok: 7, retry: 2, fail: 1 } }
        : null,
    );
    const html = await (await createApp(config).request('/')).text();
    expect(readNight).toHaveBeenCalledWith('runs', '2026-10-28');
    expect(html).toContain('<a href="/digest/2026-10-28">2026-10-28</a> ok 7 · retry 2 · fail 1');
    expect(html).toContain('<a href="/digest/2026-10-27">2026-10-27</a> —');
  });
});
