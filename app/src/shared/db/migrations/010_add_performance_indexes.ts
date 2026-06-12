// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Migration } from '../migrations';

export const migration010: Migration = {
  version: '010_add_performance_indexes',
  sql: `
    CREATE INDEX IF NOT EXISTS idx_vendors_opening_date ON vendors(opening_date);
    CREATE INDEX IF NOT EXISTS idx_vendors_registration_status_date ON vendors(registration_status_date);
    CREATE INDEX IF NOT EXISTS idx_expenses_tipo_despesa ON expenses(tipo_despesa);
  `,
};
