import type Database from 'better-sqlite3';

export interface TestExpenseSeed {
  id: string;
  deputyId: string;
  cnpj: string;
  numDocumento?: string;
  dataDocumento?: string;
}

export class TestExpensesRepository {
  constructor(private readonly db: Database.Database) {}

  seedExpense(seed: TestExpenseSeed): void {
    const { id, deputyId, cnpj, numDocumento = 'NF-1', dataDocumento = '2024-01-01' } = seed;
    this.db
      .prepare(
        `INSERT INTO expenses (id, deputy_id, tipo_despesa, cod_documento, cod_tipo_documento,
          data_documento, num_documento, url_documento, nome_fornecedor, cnpj_cpf_fornecedor,
          valor_liquido, valor_glosa)
         VALUES (?, ?, 'MANUTENCAO', ?, 0, ?, ?, NULL, 'Vendor LTDA', ?, 10000, 0)`,
      )
      .run(id, deputyId, id, dataDocumento, numDocumento, cnpj);
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
          (id, deputy_id, tipo_despesa, cod_documento, cod_tipo_documento,
           data_documento, num_documento, url_documento, nome_fornecedor,
           cnpj_cpf_fornecedor, valor_liquido, valor_glosa)
         VALUES (?, '12345678901', 'Despesa Teste', ?, 0, '2026-01-01', ?, NULL, 'Fornecedor Teste', ?, 10000, 0)`,
      )
      .run(`12345678901_${suffix}`, suffix, `NF-${suffix}`, cnpj);
  }
}
