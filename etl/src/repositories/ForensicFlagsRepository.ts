import type Database from 'better-sqlite3';
import type { ForensicFlag } from '../pipelines/forensics/ForensicFlag';
import { FORENSIC_FLAG_SCORES } from '../pipelines/forensics/ForensicFlag';

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
}
