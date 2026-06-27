// SPDX-License-Identifier: AGPL-3.0-or-later

import * as assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import nock from 'nock';
import { useTestDatabase } from '../../db/setup';
import { SenatorsDocUrlRetrievalPipeline } from '../../../src/pipelines/dados-abertos-senado/SenatorsDocUrlRetrievalPipeline';
import { TestPoliticianRepository } from '../../db/TestPoliticianRepository';
import { TestExpensesRepository } from '../../db/TestExpensesRepository';
import { PoliticianRole } from '../../../src/types/PoliticianRole';

describe('SenatorsDocUrlRetrievalPipeline', () => {
  const { getDb } = useTestDatabase();

  beforeEach(() => {
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it('populates url_documento when a PDF link is found in portal HTML', async () => {
    const db = getDb().db;
    const polRepo = new TestPoliticianRepository(db);
    const expRepo = new TestExpensesRepository(db);

    const cpf = '12345678901';
    const codSenador = '500';
    polRepo.seedBatch([
      {
        cpf,
        sourceApiId: codSenador,
        name: 'Senator Test',
        role: PoliticianRole.SENATOR,
      },
    ]);

    // Expense that needs enrichment
    const expenseId = 'EXP1';
    const cnpj = '12345678000100';
    const date = '2023-05-15';
    const valorCents = 123456; // R$ 1.234,56
    expRepo.seedBatch([
      {
        id: expenseId,
        politicianId: cpf,
        tipoDespesa:
          'Aluguel de imoveis para escritorio politico compreendendo despesas concernentes a eles',
        cnpj,
        dataDocumento: date,
        valorLiquido: valorCents,
        numDocumento: 'NF1',
      },
    ]);

    // Mock Portal HTML response
    const portalHtml = `
      <table>
        <tbody>
          <tr>
            <td>12.345.678/0001-00</td>
            <td>Category ignored here</td>
            <td>Vendor Name</td>
            <td>15/05/2023</td>
            <td>1.234,56</td>
            <td>
              <a href="/transparencia/sen/download/ceaps/documento/99999">PDF</a>
            </td>
          </tr>
        </tbody>
      </table>
    `;

    nock('https://www6g.senado.leg.br')
      .get(`/transparencia/sen/${codSenador}/ceaps/1/detalhe/`)
      .query({ mesAno: '05/2023' })
      .reply(200, portalHtml);

    const pipeline = new SenatorsDocUrlRetrievalPipeline(db);
    await pipeline.execute();

    // Verify DB update
    const row = db.prepare('SELECT url_documento FROM expenses WHERE id = ?').get(expenseId) as {
      url_documento: string;
    };
    assert.strictEqual(
      row.url_documento,
      'https://www6g.senado.leg.br/transparencia/sen/download/ceaps/documento/99999',
    );
  });

  it('skips update when no PDF link is present in portal row', async () => {
    const db = getDb().db;
    const polRepo = new TestPoliticianRepository(db);
    const expRepo = new TestExpensesRepository(db);

    const cpf = '12345678901';
    const codSenador = '500';
    polRepo.seedBatch([
      { cpf, sourceApiId: codSenador, name: 'Senator Test', role: PoliticianRole.SENATOR },
    ]);

    const expenseId = 'EXP_NO_URL';
    expRepo.seedBatch([
      {
        id: expenseId,
        politicianId: cpf,
        tipoDespesa:
          'Aquisicao de material de consumo para uso no escritorio politico inclusive aquisicao ou locacao de software despesas postais aquisicao de publicacoes locacao de moveis e de equipamentos',
        cnpj: '12345678000100',
        dataDocumento: '2023-05-15',
        valorLiquido: 5000,
        numDocumento: 'NF2',
      },
    ]);

    const portalHtml = `
      <table>
        <tbody>
          <tr>
            <td>12.345.678/0001-00</td>
            <td>Category ignored here</td>
            <td>Vendor Name</td>
            <td>15/05/2023</td>
            <td>50,00</td>
            <td>(no link here)</td>
          </tr>
        </tbody>
      </table>
    `;

    nock('https://www6g.senado.leg.br')
      .get(`/transparencia/sen/${codSenador}/ceaps/2/detalhe/`)
      .query({ mesAno: '05/2023' })
      .reply(200, portalHtml);

    const pipeline = new SenatorsDocUrlRetrievalPipeline(db);
    await pipeline.execute();

    const row = db.prepare('SELECT url_documento FROM expenses WHERE id = ?').get(expenseId) as {
      url_documento: string | null;
    };
    assert.strictEqual(row.url_documento, null);
  });

  it('idempotency: skips already enriched rows by default', async () => {
    const db = getDb().db;
    const polRepo = new TestPoliticianRepository(db);
    const expRepo = new TestExpensesRepository(db);

    const cpf = '12345678901';
    const codSenador = '500';
    polRepo.seedBatch([
      { cpf, sourceApiId: codSenador, name: 'Senator Test', role: PoliticianRole.SENATOR },
    ]);

    expRepo.seedBatch([
      {
        id: 'ALREADY_DONE',
        politicianId: cpf,
        tipoDespesa: 'DIVULGAÇÃO DA ATIVIDADE PARLAMENTAR',
        cnpj: '12345678000100',
        dataDocumento: '2023-05-15',
        valorLiquido: 10000,
        urlDocumento: 'http://existing.url',
      },
    ]);

    // nock will fail if it's called because we didn't define any interceptor
    const pipeline = new SenatorsDocUrlRetrievalPipeline(db);
    await pipeline.execute();

    // If it reaches here without nock throwing "no match", it correctly skipped.
  });

  it('forceDownload=true re-processes already enriched rows', async () => {
    const db = getDb().db;
    const polRepo = new TestPoliticianRepository(db);
    const expRepo = new TestExpensesRepository(db);

    const cpf = '12345678901';
    const codSenador = '500';
    polRepo.seedBatch([
      { cpf, sourceApiId: codSenador, name: 'Senator Test', role: PoliticianRole.SENATOR },
    ]);

    const expenseId = 'OVERWRITE_ME';
    expRepo.seedBatch([
      {
        id: expenseId,
        politicianId: cpf,
        tipoDespesa: 'DIVULGAÇÃO DA ATIVIDADE PARLAMENTAR',
        cnpj: '12345678000100',
        dataDocumento: '2023-05-15',
        valorLiquido: 10000,
        urlDocumento: 'http://old.url',
      },
    ]);

    const portalHtml = `
      <table>
        <tbody>
          <tr>
            <td>12.345.678/0001-00</td>
            <td>...</td>
            <td>...</td>
            <td>15/05/2023</td>
            <td>100,00</td>
            <td><a href="/transparencia/sen/download/ceaps/documento/new-link">PDF</a></td>
          </tr>
        </tbody>
      </table>
    `;

    nock('https://www6g.senado.leg.br')
      .get(`/transparencia/sen/${codSenador}/ceaps/5/detalhe/`)
      .query({ mesAno: '05/2023' })
      .reply(200, portalHtml);

    const pipeline = new SenatorsDocUrlRetrievalPipeline(db);
    await pipeline.execute(true);

    const row = db.prepare('SELECT url_documento FROM expenses WHERE id = ?').get(expenseId) as {
      url_documento: string;
    };
    assert.strictEqual(
      row.url_documento,
      'https://www6g.senado.leg.br/transparencia/sen/download/ceaps/documento/new-link',
    );
  });

  it('skips update when portal data does not match any DB record (composite key mismatch)', async () => {
    const db = getDb().db;
    const polRepo = new TestPoliticianRepository(db);
    const expRepo = new TestExpensesRepository(db);

    const cpf = '12345678901';
    const codSenador = '500';
    polRepo.seedBatch([
      { cpf, sourceApiId: codSenador, name: 'Senator Test', role: PoliticianRole.SENATOR },
    ]);

    const expenseId = 'EXP_MISMATCH';
    expRepo.seedBatch([
      {
        id: expenseId,
        politicianId: cpf,
        tipoDespesa:
          'Aluguel de imoveis para escritorio politico compreendendo despesas concernentes a eles',
        cnpj: '12345678000100',
        dataDocumento: '2023-05-15',
        valorLiquido: 10000,
      },
    ]);

    // Portal data has different date
    const portalHtml = `
      <table>
        <tbody>
          <tr>
            <td>12.345.678/0001-00</td>
            <td>...</td>
            <td>...</td>
            <td>16/05/2023</td>
            <td>100,00</td>
            <td><a href="/transparencia/sen/download/ceaps/documento/999">PDF</a></td>
          </tr>
        </tbody>
      </table>
    `;

    nock('https://www6g.senado.leg.br')
      .get(`/transparencia/sen/${codSenador}/ceaps/1/detalhe/`)
      .query({ mesAno: '05/2023' })
      .reply(200, portalHtml);

    const pipeline = new SenatorsDocUrlRetrievalPipeline(db);
    await pipeline.execute();

    const row = db.prepare('SELECT url_documento FROM expenses WHERE id = ?').get(expenseId) as {
      url_documento: string | null;
    };
    assert.strictEqual(row.url_documento, null);
  });

  it('skips expense with empty tipoDespesa without throwing', async () => {
    const db = getDb().db;
    const polRepo = new TestPoliticianRepository(db);
    const expRepo = new TestExpensesRepository(db);

    const cpf = '12345678901';
    const codSenador = '500';
    polRepo.seedBatch([
      { cpf, sourceApiId: codSenador, name: 'Senator Test', role: PoliticianRole.SENATOR },
    ]);

    expRepo.seedBatch([
      {
        id: 'EXP_EMPTY_TIPO',
        politicianId: cpf,
        tipoDespesa: '',
        cnpj: '12345678000100',
        dataDocumento: '2023-05-15',
        valorLiquido: 5000,
      },
    ]);

    // No nock interceptor registered — any HTTP call would throw, proving the pipeline skips
    const pipeline = new SenatorsDocUrlRetrievalPipeline(db);
    await pipeline.execute();

    const row = db
      .prepare('SELECT url_documento FROM expenses WHERE id = ?')
      .get('EXP_EMPTY_TIPO') as {
      url_documento: string | null;
    };
    assert.strictEqual(row.url_documento, null);
  });

  it('processes multiple senators and categories in the same run', async () => {
    const db = getDb().db;
    const polRepo = new TestPoliticianRepository(db);
    const expRepo = new TestExpensesRepository(db);

    polRepo.seedBatch([
      { cpf: 'S1', sourceApiId: '101', name: 'Sen 1', role: PoliticianRole.SENATOR },
      { cpf: 'S2', sourceApiId: '102', name: 'Sen 2', role: PoliticianRole.SENATOR },
    ]);

    expRepo.seedBatch([
      {
        id: 'E1',
        politicianId: 'S1',
        tipoDespesa:
          'Aquisicao de material de consumo para uso no escritorio politico inclusive aquisicao ou locacao de software despesas postais aquisicao de publicacoes locacao de moveis e de equipamentos',
        cnpj: '11111111000100',
        dataDocumento: '2023-01-01',
        valorLiquido: 1000,
      },
      {
        id: 'E2',
        politicianId: 'S2',
        tipoDespesa: 'SERVIÇOS DE SEGURANÇA PRIVADA',
        cnpj: '22222222000100',
        dataDocumento: '2023-02-01',
        valorLiquido: 2000,
      },
    ]);

    const html1 = `<table><tbody><tr><td>11.111.111/0001-00</td><td>...</td><td>...</td><td>01/01/2023</td><td>10,00</td><td><a href="/transparencia/sen/download/ceaps/documento/URL1">PDF</a></td></tr></tbody></table>`;
    const html2 = `<table><tbody><tr><td>22.222.222/0001-00</td><td>...</td><td>...</td><td>01/02/2023</td><td>20,00</td><td><a href="/transparencia/sen/download/ceaps/documento/URL2">PDF</a></td></tr></tbody></table>`;

    nock('https://www6g.senado.leg.br')
      .get('/transparencia/sen/101/ceaps/2/detalhe/')
      .query({ mesAno: '01/2023' })
      .reply(200, html1);

    nock('https://www6g.senado.leg.br')
      .get('/transparencia/sen/102/ceaps/9/detalhe/')
      .query({ mesAno: '02/2023' })
      .reply(200, html2);

    const pipeline = new SenatorsDocUrlRetrievalPipeline(db);
    await pipeline.execute();

    const r1 = db.prepare("SELECT url_documento FROM expenses WHERE id = 'E1'").get() as any;
    const r2 = db.prepare("SELECT url_documento FROM expenses WHERE id = 'E2'").get() as any;

    assert.strictEqual(
      r1.url_documento,
      'https://www6g.senado.leg.br/transparencia/sen/download/ceaps/documento/URL1',
    );
    assert.strictEqual(
      r2.url_documento,
      'https://www6g.senado.leg.br/transparencia/sen/download/ceaps/documento/URL2',
    );
  });
});
