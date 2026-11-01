// Plan morning-digest § 1. The contract every part of § 2 builds against.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One row per job for one night. Times are the log's own strings, offset kept (styleguide).
export type DigestRow = {
  job: string;
  // Last non-null owner seen for the job; null if no line names one (render as `—`).
  owner: string | null;
  // Valid lines for the job.
  runs: number;
  // Lines with status `retry`.
  retries: number;
  // Lines with status `fail`.
  fails: number;
  // Status of the job's last line by `at` (file order breaks ties).
  lastStatus: RunStatus;
  // Last error seen during the night, even if a later line succeeded; null if none.
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string;
  // Sorted by job.
  rows: DigestRow[];
  // Lines that weren't a valid run record (bad JSON, missing/invalid fields). Blank lines aren't counted.
  badLines: number;
};

// null = no file for that night (or `night` isn't YYYY-MM-DD): a 404, not "nothing ran".
// An empty file is a Night with no rows.
export type ReadNight = (runsDir: string, night: string) => Night | null;
