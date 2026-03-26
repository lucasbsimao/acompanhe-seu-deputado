import type Database from 'better-sqlite3';

export interface EmendaRecord {
  codigoEmenda: string;
  ano: number;
  tipoEmenda: string | null;
  autor: string | null;
  nomeAutor: string | null;
  numeroEmenda: string | null;
  localidadeDoGasto: string | null;
  funcao: string | null;
  subfuncao: string | null;
  valorEmpenhado: string | null;
  valorLiquidado: string | null;
  valorPago: string | null;
  valorRestoInscrito: string | null;
  valorRestoCancelado: string | null;
  valorRestoPago: string | null;
}

export class EmendaRepository {
  private readonly insertStmt: Database.Statement;

  constructor(private readonly db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT OR REPLACE INTO emendas_parlamentares (
        codigo_emenda, ano, tipo_emenda, autor, nome_autor, numero_emenda,
        localidade_gasto, funcao, subfuncao,
        valor_empenhado, valor_liquidado, valor_pago,
        valor_resto_inscrito, valor_resto_cancelado, valor_resto_pago
      ) VALUES (
        @codigoEmenda, @ano, @tipoEmenda, @autor, @nomeAutor, @numeroEmenda,
        @localidadeDoGasto, @funcao, @subfuncao,
        @valorEmpenhado, @valorLiquidado, @valorPago,
        @valorRestoInscrito, @valorRestoCancelado, @valorRestoPago
      )
    `);
  }

  insertBatch(records: EmendaRecord[]): void {
    const insert = this.db.transaction((items: EmendaRecord[]) => {
      for (const item of items) {
        this.insertStmt.run(item);
      }
    });
    insert(records);
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM emendas_parlamentares').get() as { cnt: number };
    return row.cnt;
  }
}
