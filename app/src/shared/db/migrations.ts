import { migration001 } from './migrations/001_create_initial_migration';
import { migration002 } from './migrations/002_fill_ufs';

export type Migration = {
  version: string;
  sql: string;
};

export const migrations: Migration[] = [migration001, migration002];
