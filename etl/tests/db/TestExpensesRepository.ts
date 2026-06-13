// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';

export interface TestExpenseSeed {
  id: string;
  politicianId: string;
  cnpj: string;
  numDocumento?: string;
  dataDocumento?: string;
  tipoDespesa?: string;
}

export class TestExpensesRepository {
  constructor(private readonly db: Database.Database) {}

  seedExpense(seed: TestExpenseSeed): void {
    const {
      id,
      politicianId,
      cnpj,
      numDocumento = 'NF-1',
      dataDocumento = '2024-01-01',
      tipoDespesa = 'MANUTENCAO',
    } = seed;
    this.db
      .prepare(
        `INSERT INTO expenses (id, politician_id, tipo_despesa, cod_documento, cod_tipo_documento,
          data_documento, num_documento, url_documento, nome_fornecedor, cnpj_cpf_fornecedor,
          valor_liquido, valor_glosa)
         VALUES (?, ?, ?, ?, 0, ?, ?, NULL, 'Vendor LTDA', ?, 10000, 0)`,
      )
      .run(id, politicianId, tipoDespesa, id, dataDocumento, numDocumento, cnpj);
  }

  seedExpenseWithCnpj(cnpj: string, suffix: string = '001'): void {
    this.db
      .prepare('INSERT OR IGNORE INTO parties (id, name, acronym) VALUES (?, ?, ?)')
      .run('pt', 'PT', 'PT');
    this.db
      .prepare(
        `INSERT OR IGNORE INTO politicians (cpf, source_api_id, name, uf, party_id, role, photo_url, elected_as)
         VALUES ('12345678901', '12345', 'Deputy Test', 'SP', 'pt', 'DEPUTY', NULL, 'ELEITO_POR_QP')`,
      )
      .run();
    this.db
      .prepare(
        `INSERT OR IGNORE INTO expenses
          (id, politician_id, tipo_despesa, cod_documento, cod_tipo_documento,
           data_documento, num_documento, url_documento, nome_fornecedor,
           cnpj_cpf_fornecedor, valor_liquido, valor_glosa)
         VALUES (?, '12345678901', 'Despesa Teste', ?, 0, '2026-01-01', ?, NULL, 'Fornecedor Teste', ?, 10000, 0)`,
      )
      .run(`12345678901_${suffix}`, suffix, `NF-${suffix}`, cnpj);
  }

  getAllExpenses(): any[] {
    return this.db.prepare('SELECT * FROM expenses ORDER BY id').all();
  }

  countExpenses(): number {
    return (this.db.prepare('SELECT COUNT(*) as count FROM expenses').get() as any).count;
  }
}
