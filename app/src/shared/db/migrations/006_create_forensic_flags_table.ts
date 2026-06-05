import type { Migration } from '../migrations';

export const migration006: Migration = {
  version: '006_create_forensic_flags_table',
  sql: `
    CREATE TABLE IF NOT EXISTS forensic_flags (
      source_table TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      flag_name TEXT NOT NULL,
      score INTEGER NOT NULL,
      metadata TEXT,
      PRIMARY KEY (source_table, entity_id, flag_name)
    );

    CREATE INDEX IF NOT EXISTS idx_forensic_flags_source_entity ON forensic_flags(source_table, entity_id);
  `,
};
