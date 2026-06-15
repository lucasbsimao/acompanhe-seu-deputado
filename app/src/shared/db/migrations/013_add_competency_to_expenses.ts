// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Migration } from '../migrations';

export const migration013: Migration = {
  version: '013_add_competency_to_expenses',
  sql: `
    ALTER TABLE expenses ADD COLUMN competency_year INTEGER;
    ALTER TABLE expenses ADD COLUMN competency_month INTEGER;

    CREATE INDEX IF NOT EXISTS idx_expenses_competency ON expenses(competency_year, competency_month);
  `,
};
