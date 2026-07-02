// SPDX-License-Identifier: AGPL-3.0-or-later

export const CROSS_POLITICIAN_INVOICE_REUSE_SQL = `INSERT OR REPLACE INTO forensic_flags (source_table, entity_id, flag_name, score, metadata)
         SELECT
           'expenses' AS source_table,
           e.id AS entity_id,
           ? AS flag_name,
           ? AS score,
           NULL AS metadata
         FROM expenses e
         WHERE TRIM(UPPER(e.num_documento)) NOT IN (SELECT value FROM json_each(?))
           AND e.cnpj_cpf_fornecedor != ''
           AND (e.cnpj_cpf_fornecedor, e.num_documento) IN (
             SELECT cnpj_cpf_fornecedor, num_documento
             FROM expenses
             WHERE TRIM(UPPER(num_documento)) NOT IN (SELECT value FROM json_each(?))
               AND cnpj_cpf_fornecedor != ''
             GROUP BY cnpj_cpf_fornecedor, num_documento
             HAVING COUNT(DISTINCT politician_id) >= 2
           )`;

export const DUPLICATE_INVOICE_SQL = `INSERT OR REPLACE INTO forensic_flags (source_table, entity_id, flag_name, score, metadata)
         SELECT
           'expenses' AS source_table,
           e.id AS entity_id,
           ? AS flag_name,
           ? AS score,
           NULL AS metadata
         FROM expenses e
         WHERE TRIM(UPPER(e.num_documento)) NOT IN (SELECT value FROM json_each(?))
           AND e.cnpj_cpf_fornecedor != ''
           AND (e.politician_id, e.cnpj_cpf_fornecedor, e.num_documento) IN (
             SELECT politician_id, cnpj_cpf_fornecedor, num_documento
             FROM expenses
             WHERE TRIM(UPPER(num_documento)) NOT IN (SELECT value FROM json_each(?))
               AND cnpj_cpf_fornecedor != ''
             GROUP BY politician_id, cnpj_cpf_fornecedor, num_documento
             HAVING COUNT(*) >= 2
           )`;

export const CNPJ_POSTDATES_EXPENSE_SQL = `INSERT OR REPLACE INTO forensic_flags (source_table, entity_id, flag_name, score, metadata)
         SELECT
           'expenses' AS source_table,
           e.id AS entity_id,
           ? AS flag_name,
           ? AS score,
           json_object(
             'reference_data', json_array(
               json_object('source_table', 'vendors', 'source_id', v.cnpj)
             )
           ) AS metadata
         FROM expenses e
         JOIN vendors v ON e.cnpj_cpf_fornecedor = v.cnpj
         WHERE length(e.cnpj_cpf_fornecedor) = 14
           AND v.opening_date IS NOT NULL
           AND v.opening_date > e.data_documento`;

export const CNPJ_INACTIVE_AT_EXPENSE_SQL = `INSERT OR REPLACE INTO forensic_flags (source_table, entity_id, flag_name, score, metadata)
         SELECT
           'expenses' AS source_table,
           e.id AS entity_id,
           ? AS flag_name,
           ? AS score,
           json_object(
             'reference_data', json_array(
               json_object('source_table', 'vendors', 'source_id', v.cnpj)
             )
           ) AS metadata
         FROM expenses e
         JOIN vendors v ON e.cnpj_cpf_fornecedor = v.cnpj
         WHERE length(e.cnpj_cpf_fornecedor) = 14
           AND v.registration_status IS NOT NULL
           AND v.registration_status_date IS NOT NULL
           AND v.registration_status IN (SELECT value FROM json_each(?))
           AND v.registration_status_date <= e.data_documento`;

export const CNPJ_MISSING_ESTABLISHMENT_SQL = `INSERT OR REPLACE INTO forensic_flags (source_table, entity_id, flag_name, score, metadata)
         SELECT
           'expenses' AS source_table,
           e.id AS entity_id,
           ? AS flag_name,
           ? AS score,
           NULL AS metadata
         FROM expenses e
         WHERE length(e.cnpj_cpf_fornecedor) = 14
           AND NOT EXISTS (
             SELECT 1 FROM vendors v WHERE v.cnpj = e.cnpj_cpf_fornecedor
           )
           AND EXISTS (
             SELECT 1 FROM pipeline_runs
             WHERE pipeline_name = ?
               AND completed_at >= date('now', '-45 days')
           )`;

export const VENDOR_CNAE_MISMATCH_SQL = `INSERT OR REPLACE INTO forensic_flags (source_table, entity_id, flag_name, score, metadata)
         SELECT
           'expenses' AS source_table,
           e.id AS entity_id,
           ? AS flag_name,
           ? AS score,
           json_object(
             'reference_data', json_array(
               json_object('source_table', 'vendors', 'source_id', v.cnpj)
             )
           ) AS metadata
         FROM expenses e
         JOIN vendors v ON e.cnpj_cpf_fornecedor = v.cnpj
         WHERE length(e.cnpj_cpf_fornecedor) = 14
           AND v.primary_cnae IS NOT NULL
           AND e.tipo_despesa IN (SELECT value FROM json_each(?))
           AND (
             CAST(SUBSTR(v.primary_cnae, 1, 2) AS INTEGER) BETWEEN 1 AND 3
             OR CAST(SUBSTR(v.primary_cnae, 1, 2) AS INTEGER) BETWEEN 5 AND 9
             OR CAST(SUBSTR(v.primary_cnae, 1, 2) AS INTEGER) BETWEEN 10 AND 33
           )`;

export const FRESHLY_REGISTERED_VENDOR_SQL = `WITH vendor_first_expense AS (
           SELECT cnpj_cpf_fornecedor,
                  MIN(data_documento) AS first_expense_date
           FROM expenses
           WHERE length(cnpj_cpf_fornecedor) = 14
           GROUP BY cnpj_cpf_fornecedor
         ),
         flagged AS (
           SELECT v.cnpj,
                  CAST(julianday(vfe.first_expense_date) - julianday(v.opening_date) AS INTEGER) AS gap_days
           FROM vendors v
           JOIN vendor_first_expense vfe ON v.cnpj = vfe.cnpj_cpf_fornecedor
           WHERE v.opening_date IS NOT NULL
             AND CAST(julianday(vfe.first_expense_date) - julianday(v.opening_date) AS INTEGER) >= 0
             AND CAST(julianday(vfe.first_expense_date) - julianday(v.opening_date) AS INTEGER) < 90
         )
         INSERT OR REPLACE INTO forensic_flags (source_table, entity_id, flag_name, score, metadata)
         SELECT
           'expenses' AS source_table,
           e.id AS entity_id,
           ? AS flag_name,
           CASE WHEN f.gap_days <= 7 THEN 50 ELSE 25 END AS score,
           json_object(
             'gap_days', f.gap_days,
             'range', CASE
               WHEN f.gap_days <= 7  THEN '0-7'
               WHEN f.gap_days <= 30 THEN '8-30'
               ELSE '31-90'
             END,
             'reference_data', json_array(
               json_object('source_table', 'vendors', 'source_id', f.cnpj)
             )
           ) AS metadata
         FROM expenses e
         JOIN flagged f ON e.cnpj_cpf_fornecedor = f.cnpj
         WHERE length(e.cnpj_cpf_fornecedor) = 14`;

export const VENDOR_NO_EMPLOYEES_SQL = `INSERT OR REPLACE INTO forensic_flags (source_table, entity_id, flag_name, score, metadata)
         SELECT
           'expenses' AS source_table,
           e.id AS entity_id,
           ? AS flag_name,
           CASE
             WHEN v.employee_count = 0 THEN 20
             ELSE 10
           END AS score,
           json_object(
             'reference_data', json_array(
               json_object('source_table', 'vendors', 'source_id', v.cnpj)
             )
           ) AS metadata
         FROM expenses e
         JOIN vendors v ON e.cnpj_cpf_fornecedor = v.cnpj
         WHERE length(e.cnpj_cpf_fornecedor) = 14
           AND e.tipo_despesa IN (SELECT value FROM json_each(?))
           AND (
             v.employee_count = 0
             OR (v.employee_count IS NULL AND v.company_size = ?)
           )`;

export const POLITICALLY_CONNECTED_VENDOR_SQL = `INSERT OR REPLACE INTO forensic_flags (source_table, entity_id, flag_name, score, metadata)
         SELECT
           'expenses' AS source_table,
           e.id AS entity_id,
           ? AS flag_name,
           ? AS score,
           json_object(
             'reference_data', json_array(
               json_object('source_table', 'vendor_partners', 'source_id', vp.cnpj || ':' || vp.partner_cpf_cnpj),
               json_object('source_table', 'tse_candidates', 'source_id', tc.cpf || ':' || tc.ano_eleicao)
             )
           ) AS metadata
         FROM expenses e
         JOIN vendor_partners vp ON vp.cnpj = e.cnpj_cpf_fornecedor
         JOIN tse_candidates tc ON tc.cpf = vp.partner_cpf_cnpj`;

export const COMPETENCY_DATE_MISMATCH_SQL = `INSERT OR REPLACE INTO forensic_flags (source_table, entity_id, flag_name, score, metadata)
         SELECT
           'expenses' AS source_table,
           e.id AS entity_id,
           ? AS flag_name,
           ? AS score,
           NULL AS metadata
         FROM expenses e
         WHERE e.competency_year IS NOT NULL
           AND e.competency_month IS NOT NULL
           AND e.data_documento < date(printf('%04d-%02d-01', e.competency_year, e.competency_month), '-90 days')`;

export const UNCLASSIFIED_EXPENSE_SQL = `INSERT OR REPLACE INTO forensic_flags (source_table, entity_id, flag_name, score, metadata)
         SELECT
           'expenses' AS source_table,
           e.id AS entity_id,
           ? AS flag_name,
           ? AS score,
           json_object(
             'reference_data', json_array(
               json_object('source_table', 'politicians', 'source_id', p.cpf)
             )
           ) AS metadata
         FROM expenses e
         JOIN politicians p ON e.politician_id = p.cpf
         WHERE p.role = ?
           AND (e.tipo_despesa IS NULL OR e.tipo_despesa = '')`;

export const CAMPAIGN_DONOR_VENDOR_SQL = `INSERT OR REPLACE INTO forensic_flags (source_table, entity_id, flag_name, score, metadata)
         SELECT
           'expenses' AS source_table,
           e.id AS entity_id,
           ? AS flag_name,
           ? AS score,
           json_object(
             'reference_data', json_array(
               json_object('source_table', 'vendor_partners', 'source_id', vp.cnpj || ':' || vp.partner_cpf_cnpj),
               json_object('source_table', 'tse_donations', 'source_id', td.id)
             )
           ) AS metadata
         FROM expenses e
         JOIN vendor_partners vp ON vp.cnpj = e.cnpj_cpf_fornecedor
         JOIN tse_donations td ON td.donor_cpf = vp.partner_cpf_cnpj AND td.recipient_cpf = e.politician_id`;

export const SINGLE_CLIENT_VENDOR_SQL = `INSERT OR REPLACE INTO forensic_flags (source_table, entity_id, flag_name, score, metadata)
         SELECT
           'expenses' AS source_table,
           e.id AS entity_id,
           ? AS flag_name,
           ? AS score,
           NULL AS metadata
         FROM expenses e
         WHERE e.cnpj_cpf_fornecedor != ''
           AND e.cnpj_cpf_fornecedor IN (
             SELECT cnpj_cpf_fornecedor
             FROM expenses
             WHERE cnpj_cpf_fornecedor != ''
             GROUP BY cnpj_cpf_fornecedor
             HAVING COUNT(DISTINCT politician_id) = 1
               AND COUNT(*) >= 5
           )`;
