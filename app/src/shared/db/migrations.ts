// SPDX-License-Identifier: AGPL-3.0-or-later

import { migration001 } from './migrations/001_create_initial_migration';
import { migration002 } from './migrations/002_fill_ufs';
import { migration003 } from './migrations/003_create_expenses_table';
import { migration004 } from './migrations/004_create_emendas_parlamentares_table';
import { migration005 } from './migrations/005_create_vendors_tables';
import { migration006 } from './migrations/006_create_forensic_flags_table';
import { migration007 } from './migrations/007_create_pipeline_runs_table';
import { migration008 } from './migrations/008_add_employee_count_to_vendors';
import { migration009 } from './migrations/009_create_tse_candidates_table';
import { migration010 } from './migrations/010_add_performance_indexes';

export type Migration = {
  version: string;
  sql: string;
};

export const migrations: Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008,
  migration009,
  migration010,
];
