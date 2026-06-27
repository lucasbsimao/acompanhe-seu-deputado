// SPDX-License-Identifier: AGPL-3.0-or-later

export const INSERT_EXPENSE_SQL = `
  INSERT OR REPLACE INTO expenses (
    id, politician_id, tipo_despesa, cod_documento, cod_tipo_documento,
    data_documento, num_documento, url_documento, nome_fornecedor,
    cnpj_cpf_fornecedor, valor_liquido, valor_glosa, competency_year, competency_month
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export const HAS_EXPENSES_SQL = 'SELECT 1 FROM expenses WHERE politician_id = ? LIMIT 1';

export const HAS_EXPENSES_FOR_SENATOR_YEAR_SQL = `
  SELECT 1 FROM expenses
  WHERE politician_id IN (SELECT cpf FROM politicians WHERE role = ?)
    AND data_documento LIKE ?
  LIMIT 1
`;

export const COUNT_BY_POLITICIAN_SQL =
  'SELECT COUNT(*) as count FROM expenses WHERE politician_id = ?';

export const COUNT_UNCLASSIFIED_SENATOR_EXPENSES_SQL = `
  SELECT COUNT(*) AS count
  FROM expenses e
  JOIN politicians p ON e.politician_id = p.cpf
  WHERE p.role = ?
    AND (e.tipo_despesa IS NULL OR e.tipo_despesa = '')
`;

export const GET_NULL_URL_WORK_QUEUE_SQL = `
  SELECT DISTINCT
    p.source_api_id AS cod_senador,
    e.tipo_despesa,
    strftime('%m/%Y', e.data_documento) AS mes_ano
  FROM expenses e
  JOIN politicians p ON e.politician_id = p.cpf
  WHERE e.url_documento IS NULL
    AND p.role = ?
    AND p.source_api_id IS NOT NULL
    AND e.tipo_despesa != ''
`;

export const GET_ALL_URL_WORK_QUEUE_SQL = `
  SELECT DISTINCT
    p.source_api_id AS cod_senador,
    e.tipo_despesa,
    strftime('%m/%Y', e.data_documento) AS mes_ano
  FROM expenses e
  JOIN politicians p ON e.politician_id = p.cpf
  WHERE p.role = ?
    AND p.source_api_id IS NOT NULL
    AND e.tipo_despesa != ''
`;

export const FIND_BY_COMPOSITE_KEY_SQL = `
  SELECT id FROM expenses
  WHERE politician_id = ?
    AND cnpj_cpf_fornecedor = ?
    AND data_documento = ?
    AND valor_liquido = ?
  LIMIT 1
`;

export const UPDATE_URL_SQL = 'UPDATE expenses SET url_documento = ? WHERE id = ?';

export const GET_DISTINCT_CNPJS_SQL = `
  SELECT DISTINCT cnpj_cpf_fornecedor FROM expenses
  WHERE length(cnpj_cpf_fornecedor) = 14
`;
