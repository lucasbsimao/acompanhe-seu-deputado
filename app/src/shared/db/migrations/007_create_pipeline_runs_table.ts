import type { Migration } from '../migrations';

export const migration007: Migration = {
  version: '007_create_pipeline_runs_table',
  sql: `
    CREATE TABLE IF NOT EXISTS pipeline_runs (
      pipeline_name TEXT PRIMARY KEY,
      completed_at TEXT NOT NULL,
      row_count INTEGER NOT NULL DEFAULT 0
    );
  `,
};
