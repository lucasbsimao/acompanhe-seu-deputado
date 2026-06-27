// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Migration } from '../migrations';

export const migration003: Migration = {
  version: '003_create_expenses_table',
  sql: `CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  deputy_id TEXT NOT NULL REFERENCES politicians(cpf),
  tipo_despesa TEXT,
  cod_documento TEXT NOT NULL,
  cod_tipo_documento INTEGER NOT NULL,
  data_documento TEXT NOT NULL,
  num_documento TEXT,
  url_documento TEXT,
  nome_fornecedor TEXT NOT NULL,
  cnpj_cpf_fornecedor TEXT NOT NULL,
  valor_liquido INTEGER NOT NULL,
  valor_glosa INTEGER NOT NULL,
  competency_year INTEGER,
  competency_month INTEGER
);

CREATE INDEX IF NOT EXISTS idx_expenses_deputy_id ON expenses(deputy_id);
CREATE INDEX IF NOT EXISTS idx_expenses_data_documento ON expenses(data_documento);
CREATE INDEX IF NOT EXISTS idx_expenses_cnpj_numdoc ON expenses(cnpj_cpf_fornecedor, num_documento, deputy_id);`,
};
