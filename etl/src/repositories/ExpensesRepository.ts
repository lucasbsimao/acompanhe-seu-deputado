// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';
import { CodTipoDocumento } from '../types/CodTipoDocumento';
import { PoliticianRole } from '../types/PoliticianRole';
import {
  COUNT_BY_POLITICIAN_SQL,
  FIND_BY_COMPOSITE_KEY_SQL,
  GET_ALL_URL_WORK_QUEUE_SQL,
  GET_DISTINCT_CNPJS_SQL,
  GET_NULL_URL_WORK_QUEUE_SQL,
  HAS_EXPENSES_FOR_SENATOR_YEAR_SQL,
  HAS_EXPENSES_SQL,
  INSERT_EXPENSE_SQL,
  UPDATE_URL_SQL,
} from './ExpensesRepositoryQueries';

export interface ExpenseRow {
  id: string;
  politicianId: string;
  tipoDespesa: string;
  codDocumento: string;
  codTipoDocumento: CodTipoDocumento;
  dataDocumento: string;
  numDocumento: string | null;
  urlDocumento: string | null;
  nomeFornecedor: string;
  cnpjCpfFornecedor: string;
  valorLiquido: number;
  valorGlosa: number;
  competencyYear: number | null;
  competencyMonth: number | null;
}

export interface CeapsWorkQueueItem {
  cod_senador: string;
  tipo_despesa: string;
  mes_ano: string;
}

export class ExpensesRepository {
  private readonly db: Database.Database;
  private readonly insertExpense: Database.Statement;
  private readonly insertAll: (rows: ExpenseRow[]) => void;
  private readonly hasExpensesQuery: Database.Statement;
  private readonly hasExpensesForSenatorYearQuery: Database.Statement;
  private readonly countByPoliticianQuery: Database.Statement;
  private readonly getNullUrlWorkQueueStmt: Database.Statement;
  private readonly getAllUrlWorkQueueStmt: Database.Statement;
  private readonly findByCompositeKeyStmt: Database.Statement;
  private readonly updateUrlStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;
    this.insertExpense = db.prepare(INSERT_EXPENSE_SQL);
    this.hasExpensesQuery = db.prepare(HAS_EXPENSES_SQL);
    this.hasExpensesForSenatorYearQuery = db.prepare(HAS_EXPENSES_FOR_SENATOR_YEAR_SQL);
    this.countByPoliticianQuery = db.prepare(COUNT_BY_POLITICIAN_SQL);
    this.getNullUrlWorkQueueStmt = db.prepare(GET_NULL_URL_WORK_QUEUE_SQL);
    this.getAllUrlWorkQueueStmt = db.prepare(GET_ALL_URL_WORK_QUEUE_SQL);
    this.findByCompositeKeyStmt = db.prepare(FIND_BY_COMPOSITE_KEY_SQL);
    this.updateUrlStmt = db.prepare(UPDATE_URL_SQL);
    this.insertAll = db.transaction((rows: ExpenseRow[]) => {
      for (const r of rows) {
        this.insertExpense.run(
          r.id,
          r.politicianId,
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
          r.competencyYear,
          r.competencyMonth,
        );
      }
    });
  }

  insertBatch(rows: ExpenseRow[]): void {
    this.insertAll(rows);
  }

  hasExpensesForPolitician(politicianId: string): boolean {
    return this.hasExpensesQuery.get(politicianId) !== undefined;
  }

  hasExpensesForSenatorYear(year: number): boolean {
    return (
      this.hasExpensesForSenatorYearQuery.get(PoliticianRole.SENATOR, `${year}-%`) !== undefined
    );
  }

  countByPolitician(politicianId: string): number {
    const result = this.countByPoliticianQuery.get(politicianId) as { count: number };
    return result.count;
  }

  getDistinctCnpjs(): string[] {
    const rows = this.db.prepare(GET_DISTINCT_CNPJS_SQL).all() as Array<{
      cnpj_cpf_fornecedor: string;
    }>;
    return rows.map(r => r.cnpj_cpf_fornecedor);
  }

  /**
   * Returns a list of (senator, category, month/year) tuples that need scraping.
   * @param forceDownload If true, returns all items regardless of current url_documento status.
   */
  getCeapsWorkQueue(forceDownload: boolean = false): CeapsWorkQueueItem[] {
    const stmt = forceDownload ? this.getAllUrlWorkQueueStmt : this.getNullUrlWorkQueueStmt;
    return stmt.all(PoliticianRole.SENATOR) as CeapsWorkQueueItem[];
  }

  /**
   * Matches a portal row to an internal expense ID.
   * @param politicianCpf The politician's CPF (stored in politician_id column).
   * @param cnpjCpf Normalized CNPJ or CPF of the vendor.
   * @param dataDocumento ISO date (YYYY-MM-DD).
   * @param valorLiquido Cents (integer).
   */
  findExpenseIdByCompositeKey(
    politicianCpf: string,
    cnpjCpf: string,
    dataDocumento: string,
    valorLiquido: number,
  ): string | null {
    const row = this.findByCompositeKeyStmt.get(
      politicianCpf,
      cnpjCpf,
      dataDocumento,
      valorLiquido,
    ) as { id: string } | undefined;
    return row?.id ?? null;
  }

  /**
   * Persists the scraped document URL.
   */
  updateUrlDocumento(expenseId: string, url: string): void {
    this.updateUrlStmt.run(url, expenseId);
  }
}
