// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Migration } from '../migrations';

export const migration011: Migration = {
  version: '011_create_tse_donations_table',
  sql: `CREATE TABLE IF NOT EXISTS tse_donations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  donor_cpf TEXT NOT NULL,
  recipient_cpf TEXT NOT NULL,
  ano_eleicao INTEGER NOT NULL,
  valor INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tse_donations_recipient_cpf ON tse_donations(recipient_cpf);
CREATE INDEX IF NOT EXISTS idx_tse_donations_donor_cpf ON tse_donations(donor_cpf);`,
};
