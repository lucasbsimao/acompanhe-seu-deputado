import { migration001 } from './migrations/001_create_initial_migration';
import { migration002 } from './migrations/002_fill_ufs';
import { migration003 } from './migrations/003_create_expenses_table';

export type Migration = {
  version: string;
  sql: string;
};

export const migrations: Migration[] = [migration001, migration002, migration003];
