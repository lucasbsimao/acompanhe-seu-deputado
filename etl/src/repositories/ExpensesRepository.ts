// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';
import { CodTipoDocumento } from '../types/CodTipoDocumento';

export interface ExpenseRow {
  id: string;
  deputyId: string;
  tipoDespesa: string;
  codDocumento: string;
  codTipoDocumento: CodTipoDocumento;
  dataDocumento: string;
  numDocumento: string;
  urlDocumento: string | null;
  nomeFornecedor: string;
  cnpjCpfFornecedor: string;
  valorLiquido: number;
  valorGlosa: number;
}

export class ExpensesRepository {
  private readonly db: Database.Database;
  private readonly insertExpense: Database.Statement;
  private readonly insertAll: (rows: ExpenseRow[]) => void;
  private readonly hasExpensesQuery: Database.Statement;
  private readonly hasExpensesForSenatorYearQuery: Database.Statement;
  private readonly countByDeputyQuery: Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;
    this.insertExpense = db.prepare(
      `INSERT OR REPLACE INTO expenses (
        id, deputy_id, tipo_despesa, cod_documento, cod_tipo_documento,
        data_documento, num_documento, url_documento, nome_fornecedor,
        cnpj_cpf_fornecedor, valor_liquido, valor_glosa
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.hasExpensesQuery = db.prepare('SELECT 1 FROM expenses WHERE deputy_id = ? LIMIT 1');
    this.hasExpensesForSenatorYearQuery = db.prepare(`
      SELECT 1 FROM expenses
      WHERE deputy_id IN (SELECT cpf FROM politicians WHERE role = 'SENATOR')
        AND data_documento LIKE ?
      LIMIT 1
    `);
    this.countByDeputyQuery = db.prepare(
      'SELECT COUNT(*) as count FROM expenses WHERE deputy_id = ?',
    );
    this.insertAll = db.transaction((rows: ExpenseRow[]) => {
      for (const r of rows) {
        this.insertExpense.run(
          r.id,
          r.deputyId,
          r.tipoDespesa,
          r.codDocumento,
          r.codTipoDocumento,
          r.dataDocumento,
          r.numDocumento,
          r.urlDocumento,
          r.nomeFornecedor,
          r.cnpjCpfFornecedor,
          r.valorLiquido,
          r.valorGlosa,
        );
      }
    });
  }

  insertBatch(rows: ExpenseRow[]): void {
    this.insertAll(rows);
  }

  hasExpensesForDeputy(deputyId: string): boolean {
    return this.hasExpensesQuery.get(deputyId) !== undefined;
  }

  hasExpensesForSenatorYear(year: number): boolean {
    return this.hasExpensesForSenatorYearQuery.get(`${year}-%`) !== undefined;
  }

  countByDeputy(deputyId: string): number {
    const result = this.countByDeputyQuery.get(deputyId) as { count: number };
    return result.count;
  }

  getDistinctCnpjs(): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT cnpj_cpf_fornecedor FROM expenses
       WHERE length(cnpj_cpf_fornecedor) = 14`,
      )
      .all() as Array<{ cnpj_cpf_fornecedor: string }>;
    return rows.map(r => r.cnpj_cpf_fornecedor);
  }
}
