import type { Migration } from '../migrations';

export const migration008: Migration = {
  version: '008_add_employee_count_to_vendors',
  sql: 'ALTER TABLE vendors ADD COLUMN employee_count INTEGER;',
};
