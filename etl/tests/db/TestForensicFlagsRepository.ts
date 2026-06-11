// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';

export interface ForensicFlagRow {
  entity_id: string;
  flag_name: string;
  score: number;
  source_table: string;
  metadata: string | null;
}

export class TestForensicFlagsRepository {
  constructor(private readonly db: Database.Database) {}

  getAllFlags(): ForensicFlagRow[] {
    return this.db
      .prepare('SELECT * FROM forensic_flags ORDER BY entity_id')
      .all() as ForensicFlagRow[];
  }
}
