// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';
import type { ForensicFlag } from '../pipelines/forensics/ForensicFlag';
import { FORENSIC_FLAG_SCORES } from '../pipelines/forensics/ForensicFlag';
import { CompanySize } from '../types/CompanySize';

export class ForensicFlagsRepository {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  insertCrossDeputyInvoiceReuse(
    flagName: ForensicFlag,
    excludedSerialNumbers: readonly string[],
  ): void {
    const score = FORENSIC_FLAG_SCORES[flagName];
    const snJson = JSON.stringify(excludedSerialNumbers);
    this.db
      .prepare(
        `INSERT OR REPLACE INTO forensic_flags (source_table, entity_id, flag_name, score, metadata)
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
             HAVING COUNT(DISTINCT deputy_id) >= 2
           )`,
      )
      .run(flagName, score, snJson, snJson);
  }

  insertCnpjPostdatesExpense(flagName: ForensicFlag): void {
    const score = FORENSIC_FLAG_SCORES[flagName];
    this.db
      .prepare(
        `INSERT OR REPLACE INTO forensic_flags (source_table, entity_id, flag_name, score, metadata)
         SELECT
           'expenses' AS source_table,
           e.id AS entity_id,
           ? AS flag_name,
           ? AS score,
           NULL AS metadata
         FROM expenses e
         JOIN vendors v ON e.cnpj_cpf_fornecedor = v.cnpj
         WHERE length(e.cnpj_cpf_fornecedor) = 14
           AND v.opening_date IS NOT NULL
           AND v.opening_date > e.data_documento`,
      )
      .run(flagName, score);
  }

  insertCnpjInactiveAtExpense(flagName: ForensicFlag, inactiveStatuses: readonly string[]): void {
    const score = FORENSIC_FLAG_SCORES[flagName];
    const statusesJson = JSON.stringify(inactiveStatuses);
    this.db
      .prepare(
        `INSERT OR REPLACE INTO forensic_flags (source_table, entity_id, flag_name, score, metadata)
         SELECT
           'expenses' AS source_table,
           e.id AS entity_id,
           ? AS flag_name,
           ? AS score,
           NULL AS metadata
         FROM expenses e
         JOIN vendors v ON e.cnpj_cpf_fornecedor = v.cnpj
         WHERE length(e.cnpj_cpf_fornecedor) = 14
           AND v.registration_status IS NOT NULL
           AND v.registration_status_date IS NOT NULL
           AND v.registration_status IN (SELECT value FROM json_each(?))
           AND v.registration_status_date <= e.data_documento`,
      )
      .run(flagName, score, statusesJson);
  }

  insertCnpjMissingEstablishment(flagName: ForensicFlag, pipelineDependency: string): void {
    const score = FORENSIC_FLAG_SCORES[flagName];
    this.db
      .prepare(
        `INSERT OR REPLACE INTO forensic_flags (source_table, entity_id, flag_name, score, metadata)
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
           )`,
      )
      .run(flagName, score, pipelineDependency);
  }

  insertVendorCnaeMismatch(
    flagName: ForensicFlag,
    incompatibleExpenseTypes: readonly string[],
  ): void {
    const score = FORENSIC_FLAG_SCORES[flagName];
    const expenseTypesJson = JSON.stringify(incompatibleExpenseTypes);
    this.db
      .prepare(
        `INSERT OR REPLACE INTO forensic_flags (source_table, entity_id, flag_name, score, metadata)
         SELECT
           'expenses' AS source_table,
           e.id AS entity_id,
           ? AS flag_name,
           ? AS score,
           json_object('primary_cnae', v.primary_cnae, 'tipo_despesa', e.tipo_despesa) AS metadata
         FROM expenses e
         JOIN vendors v ON e.cnpj_cpf_fornecedor = v.cnpj
         WHERE length(e.cnpj_cpf_fornecedor) = 14
           AND v.primary_cnae IS NOT NULL
           AND e.tipo_despesa IN (SELECT value FROM json_each(?))
           AND (
             CAST(SUBSTR(v.primary_cnae, 1, 2) AS INTEGER) BETWEEN 1 AND 3
             OR CAST(SUBSTR(v.primary_cnae, 1, 2) AS INTEGER) BETWEEN 5 AND 9
             OR CAST(SUBSTR(v.primary_cnae, 1, 2) AS INTEGER) BETWEEN 10 AND 33
           )`,
      )
      .run(flagName, score, expenseTypesJson);
  }

  insertFreshlyRegisteredVendor(flagName: ForensicFlag): void {
    this.db
      .prepare(
        `WITH vendor_first_expense AS (
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
             END
           ) AS metadata
         FROM expenses e
         JOIN flagged f ON e.cnpj_cpf_fornecedor = f.cnpj
         WHERE length(e.cnpj_cpf_fornecedor) = 14`,
      )
      .run(flagName);
  }

  insertVendorNoEmployees(flagName: ForensicFlag, expenseTypes: readonly string[]): void {
    const expenseTypesJson = JSON.stringify(expenseTypes);
    this.db
      .prepare(
        `INSERT OR REPLACE INTO forensic_flags (source_table, entity_id, flag_name, score, metadata)
         SELECT
           'expenses' AS source_table,
           e.id AS entity_id,
           ? AS flag_name,
           CASE
             WHEN v.employee_count = 0 THEN 20
             ELSE 10
           END AS score,
           json_object(
             'employee_count', v.employee_count,
             'company_size', v.company_size,
             'tipo_despesa', e.tipo_despesa
           ) AS metadata
         FROM expenses e
         JOIN vendors v ON e.cnpj_cpf_fornecedor = v.cnpj
         WHERE length(e.cnpj_cpf_fornecedor) = 14
           AND e.tipo_despesa IN (SELECT value FROM json_each(?))
           AND (
             v.employee_count = 0
             OR (v.employee_count IS NULL AND v.company_size = ?)
           )`,
      )
      .run(flagName, expenseTypesJson, CompanySize.MICRO_EMPRESA);
  }

  insertPoliticallyConnectedVendor(flagName: ForensicFlag): void {
    const score = FORENSIC_FLAG_SCORES[flagName];
    this.db
      .prepare(
        `INSERT OR REPLACE INTO forensic_flags (source_table, entity_id, flag_name, score, metadata)
         SELECT
           'expenses' AS source_table,
           e.id AS entity_id,
           ? AS flag_name,
           ? AS score,
           json_object('partner_cpf', vp.partner_cpf_cnpj, 'partner_name', vp.partner_name) AS metadata
         FROM expenses e
         JOIN vendor_partners vp ON vp.cnpj = e.cnpj_cpf_fornecedor
         WHERE EXISTS (
           SELECT 1 FROM tse_candidates tc WHERE tc.cpf = vp.partner_cpf_cnpj
         )`,
      )
      .run(flagName, score);
  }
}
