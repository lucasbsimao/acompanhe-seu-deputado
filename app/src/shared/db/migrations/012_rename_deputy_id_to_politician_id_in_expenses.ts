// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Migration } from '../migrations';

export const migration012: Migration = {
  version: '012_rename_deputy_id_to_politician_id_in_expenses',
  sql: `
    ALTER TABLE expenses RENAME COLUMN deputy_id TO politician_id;
    DROP INDEX IF EXISTS idx_expenses_deputy_id;
    CREATE INDEX IF NOT EXISTS idx_expenses_politician_id ON expenses(politician_id);
    DROP INDEX IF EXISTS idx_expenses_cnpj_numdoc;
    CREATE INDEX IF NOT EXISTS idx_expenses_cnpj_numdoc ON expenses(cnpj_cpf_fornecedor, num_documento, politician_id);
  `,
};
