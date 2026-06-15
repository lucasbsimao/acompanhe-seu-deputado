// SPDX-License-Identifier: AGPL-3.0-or-later

import * as assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import nock from 'nock';
import AdmZip from 'adm-zip';
import { TSE2018SenatorsPipeline } from '../../../src/pipelines/tse-dados-abertos/TSE2018SenatorsPipeline';
import { TseCandidatesRepository } from '../../../src/repositories/TseCandidatesRepository';
import { useTestDatabase } from '../../db/setup';
import { makeCPF } from '../../db/TestPoliticianRepository';

const TSE_ORIGIN = 'https://cdn.tse.jus.br';
const TSE_ZIP_PATH = '/estatistica/sead/odsele/consulta_cand/consulta_cand_2018.zip';

// CSV header with required fields for TSECandidate
const CSV_HEADER =
  'DT_GERACAO;HH_GERACAO;ANO_ELEICAO;CD_TIPO_ELEICAO;NM_TIPO_ELEICAO;NR_TURNO;CD_ELEICAO;DS_ELEICAO;DT_ELEICAO;TP_ABRANGENCIA;SG_UF;SG_UE;NM_UE;CD_CARGO;DS_CARGO;NR_CANDIDATO;NM_CANDIDATO;NM_URNA_CANDIDATO;NM_SOCIAL_CANDIDATO;NR_CPF_CANDIDATO;NM_EMAIL;CD_SITUACAO_CANDIDATURA;DS_SITUACAO_CANDIDATURA;CD_DETALHE_SITUACAO_CAND;DS_DETALHE_SITUACAO_CAND;TP_AGREMIACAO;NR_PARTIDO;SG_PARTIDO;NM_PARTIDO;SQ_COLIGACAO;NM_COLIGACAO;CD_NACIONALIDADE;DS_NACIONALIDADE;SG_UF_NASCIMENTO;CD_MUNICIPIO_NASCIMENTO;NM_MUNICIPIO_NASCIMENTO;DT_NASCIMENTO;NR_IDADE_DATA_POSSE;CD_ESTADO_CIVIL;DS_ESTADO_CIVIL;CD_GENERO;DS_GENERO;CD_GRAU_INSTRUCAO;DS_GRAU_INSTRUCAO;CD_OCUPACAO;DS_OCUPACAO;NR_PROTOCOLO_CANDIDATURA;NR_PROCESSO;CD_SITUACAO_CANDIDATO_PLEITO;DS_SITUACAO_CANDIDATO_PLEITO;CD_SITUACAO_CANDIDATO_URNA;DS_SITUACAO_CANDIDATO_URNA;CD_SITUACAO_CANDIDATO_TOT;DS_SIT_TOT_TURNO';

function buildCandidateRow(opts: {
  DS_CARGO: string;
  NM_URNA_CANDIDATO: string;
  NR_CPF_CANDIDATO: string;
  SG_UF: string;
  SG_PARTIDO: string;
  DS_SIT_TOT_TURNO: string;
  ANO_ELEICAO: string;
}): string {
  const cols = Array(54).fill('');
  cols[2] = opts.ANO_ELEICAO;
  cols[10] = opts.SG_UF;
  cols[14] = opts.DS_CARGO;
  cols[17] = opts.NM_URNA_CANDIDATO;
  cols[19] = opts.NR_CPF_CANDIDATO;
  cols[27] = opts.SG_PARTIDO;
  cols[53] = opts.DS_SIT_TOT_TURNO;
  return cols.join(';');
}

function buildTSEZip(rows: string[]): Buffer {
  const csvContent = [CSV_HEADER, ...rows].join('\n');
  const zip = new AdmZip();
  zip.addFile('consulta_cand_2018_BRASIL.csv', Buffer.from(csvContent, 'latin1'));
  return zip.toBuffer();
}

function stubTSEZipDownload(zipBuffer: Buffer): void {
  nock(TSE_ORIGIN).get(TSE_ZIP_PATH).reply(200, zipBuffer, { 'content-type': 'application/zip' });
}

describe('TSE2018SenatorsPipeline Integration Tests', () => {
  const { getDb } = useTestDatabase();

  let db: ReturnType<typeof getDb>['db'];

  beforeEach(() => {
    db = getDb().db;
    nock.cleanAll();
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it('persists elected 2018 senators — happy path', async () => {
    const senatorCpf = makeCPF(1);
    const otherCpf = makeCPF(2);

    const rows = [
      buildCandidateRow({
        ANO_ELEICAO: '2018',
        DS_CARGO: 'SENADOR',
        NM_URNA_CANDIDATO: 'SENADOR 2018',
        NR_CPF_CANDIDATO: senatorCpf,
        SG_UF: 'SP',
        SG_PARTIDO: 'PSDB',
        DS_SIT_TOT_TURNO: 'ELEITO',
      }),
      // Another senator not elected (should be in tse_candidates but not in politicians)
      buildCandidateRow({
        ANO_ELEICAO: '2018',
        DS_CARGO: 'SENADOR',
        NM_URNA_CANDIDATO: 'SENADOR NÃO ELEITO',
        NR_CPF_CANDIDATO: otherCpf,
        SG_UF: 'SP',
        SG_PARTIDO: 'PSDB',
        DS_SIT_TOT_TURNO: 'NÃO ELEITO',
      }),
    ];

    stubTSEZipDownload(buildTSEZip(rows));

    const pipeline = new TSE2018SenatorsPipeline(db);
    await pipeline.execute(true);

    const tseCandidatesRepo = new TseCandidatesRepository(db);
    assert.strictEqual(tseCandidatesRepo.countByCargoAndYear('SENADOR', '2018'), 2);

    const senator = db.prepare('SELECT * FROM politicians WHERE cpf = ?').get(senatorCpf) as any;
    assert.ok(senator);
    assert.strictEqual(senator.name, 'SENADOR 2018');
    assert.strictEqual(senator.role, 'SENATOR');

    const nonElected = db.prepare('SELECT * FROM politicians WHERE cpf = ?').get(otherCpf);
    assert.ok(!nonElected);

    assert.ok(nock.isDone());
  });

  it('filters out non-senator cargos', async () => {
    const deputyCpf = makeCPF(3);

    const rows = [
      buildCandidateRow({
        ANO_ELEICAO: '2018',
        DS_CARGO: 'DEPUTADO FEDERAL',
        NM_URNA_CANDIDATO: 'DEPUTADO 2018',
        NR_CPF_CANDIDATO: deputyCpf,
        SG_UF: 'RJ',
        SG_PARTIDO: 'PT',
        DS_SIT_TOT_TURNO: 'ELEITO',
      }),
    ];

    stubTSEZipDownload(buildTSEZip(rows));

    const pipeline = new TSE2018SenatorsPipeline(db);
    await pipeline.execute(true);

    const tseCandidatesRepo = new TseCandidatesRepository(db);
    assert.strictEqual(tseCandidatesRepo.countByCargoAndYear('DEPUTADO FEDERAL', '2018'), 0);

    const deputy = db.prepare('SELECT * FROM politicians WHERE cpf = ?').get(deputyCpf);
    assert.ok(!deputy);

    assert.ok(nock.isDone());
  });

  it('skips download when 2018 senators already present', async () => {
    const tseCandidatesRepo = new TseCandidatesRepository(db);
    // Directly insert a candidate to simulate existing data
    db.prepare(
      `
      INSERT INTO tse_candidates (cpf, nome, cargo, partido, ano_eleicao, uf)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    ).run(makeCPF(10), 'EXISTING', 'SENADOR', 'MDB', '2018', 'MG');

    assert.strictEqual(tseCandidatesRepo.countByCargoAndYear('SENADOR', '2018'), 1);

    const pipeline = new TSE2018SenatorsPipeline(db);
    await pipeline.execute(); // forceDownload = false

    assert.ok(nock.isDone()); // Should not have made any HTTP calls
  });

  it('force-download bypasses skip', async () => {
    db.prepare(
      `
      INSERT INTO tse_candidates (cpf, nome, cargo, partido, ano_eleicao, uf)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    ).run(makeCPF(10), 'EXISTING', 'SENADOR', 'MDB', '2018', 'MG');

    const newCpf = makeCPF(11);
    const rows = [
      buildCandidateRow({
        ANO_ELEICAO: '2018',
        DS_CARGO: 'SENADOR',
        NM_URNA_CANDIDATO: 'NEW SENATOR',
        NR_CPF_CANDIDATO: newCpf,
        SG_UF: 'SC',
        SG_PARTIDO: 'PSD',
        DS_SIT_TOT_TURNO: 'ELEITO',
      }),
    ];

    stubTSEZipDownload(buildTSEZip(rows));

    const pipeline = new TSE2018SenatorsPipeline(db);
    await pipeline.execute(true);

    const tseCandidatesRepo = new TseCandidatesRepository(db);
    assert.strictEqual(tseCandidatesRepo.countByCargoAndYear('SENADOR', '2018'), 2);
    assert.ok(nock.isDone());
  });
});
