// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';

export interface PipelineRun {
  pipeline_name: string;
  completed_at: string;
  row_count: number;
}

export class PipelineRunsRepository {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  recordRun(pipelineName: string, rowCount: number): void {
    const completedAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT OR REPLACE INTO pipeline_runs (pipeline_name, completed_at, row_count)
         VALUES (?, ?, ?)`,
      )
      .run(pipelineName, completedAt, rowCount);
  }

  getLatestRun(pipelineName: string): PipelineRun | undefined {
    return this.db
      .prepare<string, PipelineRun>(
        `SELECT pipeline_name, completed_at, row_count
         FROM pipeline_runs
         WHERE pipeline_name = ?`,
      )
      .get(pipelineName);
  }
}
