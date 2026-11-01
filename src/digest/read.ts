import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, JobStatus, Night, ReadNight, RunLine } from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly JobStatus[] = ['ok', 'retry', 'fail'];

// A row plus the parsed times behind its firstAt/lastAt (NaN when `at` doesn't parse).
type Acc = { row: DigestRow; first: number; last: number };

const isStatus = (v: unknown): v is JobStatus => STATUSES.some((s) => s === v);

// One log line → RunLine, or null when it doesn't parse or validate.
const parseLine = (text: string): RunLine | null => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { at, job, status, owner, error } = value as Record<string, unknown>;
  if (typeof at !== 'string' || typeof job !== 'string' || !isStatus(status)) return null;
  if (owner !== undefined && owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && typeof error !== 'string') return null;
  const line: RunLine = { at, job, status, owner: owner ?? null };
  if (error !== undefined) line.error = error;
  return line;
};

const readFile = (path: string): string | null => {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
};

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;
  const text = readFile(join(runsDir, `${night}.jsonl`));
  if (text === null) return null;

  let badLines = 0;
  const counts: Record<JobStatus, number> = { ok: 0, retry: 0, fail: 0 };
  const byJob = new Map<string, Acc>();
  // File order decides "last" (status, error, owner); parsed time decides firstAt/lastAt.
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (!line) {
      badLines++;
      continue;
    }
    counts[line.status]++;
    const time = Date.parse(line.at);
    const acc = byJob.get(line.job);
    if (!acc) {
      byJob.set(line.job, {
        row: {
          job: line.job,
          owner: line.owner,
          runs: 1,
          retries: line.status === 'retry' ? 1 : 0,
          lastStatus: line.status,
          fails: line.status === 'fail' ? 1 : 0,
          lastError: line.error ?? null,
          firstAt: line.at,
          lastAt: line.at,
        },
        first: time,
        last: time,
      });
      continue;
    }
    const { row } = acc;
    row.owner = line.owner;
    row.runs++;
    if (line.status === 'retry') row.retries++;
    if (line.status === 'fail') row.fails++;
    row.lastStatus = line.status;
    if (line.error !== undefined) row.lastError = line.error;
    // An unparseable time never displaces a parseable one; ties go to the later line.
    if (!Number.isNaN(time) && (Number.isNaN(acc.first) || time < acc.first)) {
      row.firstAt = line.at;
      acc.first = time;
    }
    if (Number.isNaN(acc.last) || time >= acc.last) {
      row.lastAt = line.at;
      acc.last = time;
    }
  }

  const rows = [...byJob.values()]
    .map((a) => a.row)
    .sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  const result: Night = { night, rows, badLines, counts };
  return result;
};
