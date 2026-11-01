import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

let dir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  copyFileSync('runs/2026-10-28.jsonl', join(dir, '2026-10-28.jsonl'));
  writeFileSync(join(dir, '2026-10-30.jsonl'), '');
  writeFileSync(
    join(dir, '2026-10-31.jsonl'),
    '{"at":"2026-10-31T23:00:02+01:00","job":"a/job","status":"ok","owner":"rook"}\nnot json\n',
  );
  app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir });
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('digest routes', () => {
  it('page and JSON agree on jobs and order for the real night', async () => {
    const page = await app.request('/digest/2026-10-28');
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(html).toContain('digest · 2026-10-28');
    const res = await app.request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const night = (await res.json()) as Night;
    expect(night.rows).toHaveLength(5);
    const positions = night.rows.map((r) => html.indexOf(r.job));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('404s a night with no file, page and JSON', async () => {
    const page = await app.request('/digest/2026-01-01');
    expect(page.status).toBe(404);
    expect(await page.text()).toContain('no such night');
    const res = await app.request('/api/digest/2026-01-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night' });
  });

  it('renders the empty night', async () => {
    const page = await app.request('/digest/2026-10-30');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('nothing ran');
    const night = (await (await app.request('/api/digest/2026-10-30')).json()) as Night;
    expect(night.rows).toEqual([]);
  });

  it('counts a bad line and still renders', async () => {
    const page = await app.request('/digest/2026-10-31');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('1 bad line skipped');
    const res = await app.request('/api/digest/2026-10-31');
    expect(res.status).toBe(200);
    expect(((await res.json()) as Night).badLines).toBe(1);
  });
});
