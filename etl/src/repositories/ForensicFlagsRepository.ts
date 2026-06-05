import type Database from 'better-sqlite3';
import { ForensicFlag, FORENSIC_FLAG_SCORES } from '../pipelines/forensics/ForensicFlag';

export class ForensicFlagsRepository {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  insertCrossDeputyInvoiceReuse(flagName: ForensicFlag, snPlaceholders: readonly string[]): void {
    const params = snPlaceholders.map(() => '?').join(', ');
    this.db
      .prepare(
        `INSERT OR REPLACE INTO forensic_flags (source_table, entity_id, flag_name, score, metadata)
         SELECT
           'expenses'                AS source_table,
           e.id                     AS entity_id,
           ?                        AS flag_name,
           ${FORENSIC_FLAG_SCORES[flagName]}      AS score,
           NULL                     AS metadata
         FROM expenses e
         WHERE TRIM(UPPER(e.num_documento)) NOT IN (${params})
           AND e.cnpj_cpf_fornecedor != ''
           AND (e.cnpj_cpf_fornecedor, e.num_documento) IN (
               SELECT cnpj_cpf_fornecedor, num_documento
               FROM expenses
               WHERE TRIM(UPPER(num_documento)) NOT IN (${params})
                 AND cnpj_cpf_fornecedor != ''
               GROUP BY cnpj_cpf_fornecedor, num_documento
               HAVING COUNT(DISTINCT deputy_id) >= 2
           )`
      )
      .run(flagName, ...snPlaceholders, ...snPlaceholders);
  }
}
