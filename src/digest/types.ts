// Plan morning-digest § 1. The contract every part of § 2 builds against.

export type JobStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, after parsing.
export type RunLine = {
  at: string; // ISO 8601 with the log's own offset; never converted for display
  job: string;
  status: JobStatus;
  owner: string | null;
  error?: string;
};

// One row per job in the night.
export type DigestRow = {
  job: string;
  owner: string | null; // last owner seen; null renders as `—`
  runs: number; // lines for this job
  retries: number; // lines with status `retry`
  lastStatus: JobStatus;
  fails: number; // lines with status `fail`
  lastError: string | null; // error of the last line that had one
  firstAt: string; // as written in the log
  lastAt: string; // as written in the log
};

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job; the page and the JSON both use this order
  badLines: number; // lines that did not parse; counted, never thrown
  counts: Record<JobStatus, number>; // parsed lines by status
};

// Reads runs/<night>.jsonl. Returns null when the file does not exist.
// An empty file gives rows: [] (renders "nothing ran").
export type ReadNight = (runsDir: string, night: string) => Night | null;
