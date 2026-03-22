import type Database from 'better-sqlite3';

export interface ExpenseRow {
  id: string;
  deputyId: string;
  tipoDespesa: string;
  codDocumento: string;
  codTipoDocumento: number;
  dataDocumento: string;
  numDocumento: string;
  urlDocumento: string | null;
  nomeFornecedor: string;
  cnpjCpfFornecedor: string;
  valorLiquido: number;
  valorGlosa: number;
}

export class ExpensesRepository {
  private readonly insertExpense: Database.Statement;
  private readonly insertAll: (rows: ExpenseRow[]) => void;
  private readonly hasExpensesQuery: Database.Statement;
  private readonly countByDeputyQuery: Database.Statement;

  constructor(db: Database.Database) {
    this.insertExpense = db.prepare(
      `INSERT OR REPLACE INTO expenses (
        id, deputy_id, tipo_despesa, cod_documento, cod_tipo_documento,
        data_documento, num_documento, url_documento, nome_fornecedor,
        cnpj_cpf_fornecedor, valor_liquido, valor_glosa
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    this.hasExpensesQuery = db.prepare(
      'SELECT 1 FROM expenses WHERE deputy_id = ? LIMIT 1'
    );
    this.countByDeputyQuery = db.prepare(
      'SELECT COUNT(*) as count FROM expenses WHERE deputy_id = ?'
    );
    this.insertAll = db.transaction((rows: ExpenseRow[]) => {
      for (const r of rows) {
        this.insertExpense.run(
          r.id, r.deputyId, r.tipoDespesa, r.codDocumento, r.codTipoDocumento,
          r.dataDocumento, r.numDocumento, r.urlDocumento, r.nomeFornecedor,
          r.cnpjCpfFornecedor, r.valorLiquido, r.valorGlosa
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

  countByDeputy(deputyId: string): number {
    const result = this.countByDeputyQuery.get(deputyId) as { count: number };
    return result.count;
  }
}
