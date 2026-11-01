import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

const tmp = mkdtempSync(join(tmpdir(), 'rig-runs-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const line = (o: object) => JSON.stringify(o);

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');
  const row = (job: string) => night?.rows.find((r) => r.job === job);

  it('gives one row per job, sorted, and counts the bad line', () => {
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night?.badLines).toBe(1);
    expect(night?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('aggregates retries, failures and errors', () => {
    expect(row('fixtures/refresh')).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503' });
    expect(row('notes/backup')).toMatchObject({ lastStatus: 'fail', fails: 1, lastError: 'quota exceeded' });
    expect(row('digest/render')?.owner).toBeNull();
  });

  it('keeps times as written in the log', () => {
    expect(row('lane/sync')).toMatchObject({ firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00' });
  });
});

describe('readNight edge cases', () => {
  it('returns null for a missing file or an invalid night', () => {
    expect(readNight(tmp, '2026-01-01')).toBeNull();
    writeFileSync(join(tmp, 'evil.jsonl'), '');
    expect(readNight(tmp, 'evil')).toBeNull();
    expect(readNight(tmp, '../runs/2026-10-28')).toBeNull();
  });

  it('gives rows [] for an empty file; blank lines are not bad', () => {
    writeFileSync(join(tmp, '2026-01-02.jsonl'), '\n\n');
    expect(readNight(tmp, '2026-01-02')).toEqual({ night: '2026-01-02', rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('counts invalid lines as bad, keeps null or missing owner as null', () => {
    writeFileSync(
      join(tmp, '2026-01-03.jsonl'),
      [
        line({ at: '2026-01-03T01:00:00+01:00', job: 'a', status: 'ok', owner: null }),
        line({ at: '2026-01-03T02:00:00+01:00', job: 'b', status: 'ok' }),
        line({ at: '2026-01-03T03:00:00+01:00', job: 'c', status: 'done', owner: 'x' }),
        line({ at: '2026-01-03T03:00:00+01:00', job: 'c', status: 'ok', owner: 7 }),
        line({ at: '2026-01-03T03:00:00+01:00', job: 'c', status: 'ok', owner: 'x', error: 1 }),
        line({ at: 5, job: 'c', status: 'ok', owner: 'x' }),
        '[]',
        '{nope',
      ].join('\n'),
    );
    const night = readNight(tmp, '2026-01-03');
    expect(night?.badLines).toBe(6);
    expect(night?.rows.map((r) => [r.job, r.owner])).toEqual([
      ['a', null],
      ['b', null],
    ]);
  });

  it('picks firstAt/lastAt by time, keeps the offset; other "last" fields follow file order', () => {
    writeFileSync(
      join(tmp, '2026-01-04.jsonl'),
      [
        line({ at: '2026-01-04T01:00:00+01:00', job: 'j', status: 'fail', owner: 'late', error: 'boom' }),
        line({ at: '2026-01-03T23:30:00Z', job: 'j', status: 'ok', owner: 'early' }),
      ].join('\n'),
    );
    expect(readNight(tmp, '2026-01-04')?.rows[0]).toMatchObject({
      firstAt: '2026-01-03T23:30:00Z',
      lastAt: '2026-01-04T01:00:00+01:00',
      lastStatus: 'ok',
      lastError: 'boom',
      owner: 'early',
      runs: 2,
    });
  });

  it('keeps a line whose at is a string but not a time; it never wins firstAt/lastAt', () => {
    writeFileSync(
      join(tmp, '2026-01-05.jsonl'),
      [
        line({ at: 'not a time', job: 'j', status: 'retry', owner: 'x' }),
        line({ at: '2026-01-05T01:00:00+01:00', job: 'j', status: 'ok', owner: 'x' }),
        line({ at: 'later?', job: 'j', status: 'fail', owner: 'x', error: 'e' }),
        line({ at: 'whenever', job: 'k', status: 'ok', owner: null }),
      ].join('\n'),
    );
    const night = readNight(tmp, '2026-01-05');
    expect(night?.badLines).toBe(0);
    expect(night?.counts).toEqual({ ok: 2, retry: 1, fail: 1 });
    expect(night?.rows).toMatchObject([
      { job: 'j', runs: 3, retries: 1, fails: 1, lastStatus: 'fail', firstAt: '2026-01-05T01:00:00+01:00', lastAt: '2026-01-05T01:00:00+01:00' },
      { job: 'k', runs: 1, firstAt: 'whenever', lastAt: 'whenever' },
    ]);
  });
});
