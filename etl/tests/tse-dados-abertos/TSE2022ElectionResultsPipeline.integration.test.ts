import * as assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import nock from 'nock';
import AdmZip from 'adm-zip';
import { TSE2022ElectionResultsPipeline } from '../../src/pipelines/tse-dados-abertos/TSE2022ElectionResultsPipeline';
import { useTestDatabase } from '../db/setup';

const TSE_ORIGIN = 'https://cdn.tse.jus.br';
const TSE_ZIP_PATH = '/estatistica/sead/odsele/consulta_cand/consulta_cand_2022.zip';

// CSV header for the TSE candidates file (semicolon-delimited, latin1)
const CSV_HEADER =
  'DT_GERACAO;HH_GERACAO;ANO_ELEICAO;CD_TIPO_ELEICAO;NM_TIPO_ELEICAO;NR_TURNO;CD_ELEICAO;DS_ELEICAO;DT_ELEICAO;TP_ABRANGENCIA;SG_UF;SG_UE;NM_UE;CD_CARGO;DS_CARGO;NR_CANDIDATO;NM_CANDIDATO;NM_URNA_CANDIDATO;NM_SOCIAL_CANDIDATO;NR_CPF_CANDIDATO;NM_EMAIL;CD_SITUACAO_CANDIDATURA;DS_SITUACAO_CANDIDATURA;CD_DETALHE_SITUACAO_CAND;DS_DETALHE_SITUACAO_CAND;TP_AGREMIACAO;NR_PARTIDO;SG_PARTIDO;NM_PARTIDO;SQ_COLIGACAO;NM_COLIGACAO;CD_NACIONALIDADE;DS_NACIONALIDADE;SG_UF_NASCIMENTO;CD_MUNICIPIO_NASCIMENTO;NM_MUNICIPIO_NASCIMENTO;DT_NASCIMENTO;NR_IDADE_DATA_POSSE;CD_ESTADO_CIVIL;DS_ESTADO_CIVIL;CD_GENERO;DS_GENERO;CD_GRAU_INSTRUCAO;DS_GRAU_INSTRUCAO;CD_OCUPACAO;DS_OCUPACAO;NR_PROTOCOLO_CANDIDATURA;NR_PROCESSO;CD_SITUACAO_CANDIDATO_PLEITO;DS_SITUACAO_CANDIDATO_PLEITO;CD_SITUACAO_CANDIDATO_URNA;DS_SITUACAO_CANDIDATO_URNA;CD_SITUACAO_CANDIDATO_TOT;DS_SIT_TOT_TURNO';

/**
 * Build a single CSV candidate row. Only fields used by the pipeline are populated;
 * the remaining columns receive empty strings.
 */
function buildCandidateRow(opts: {
  DS_CARGO: string;
  NM_URNA_CANDIDATO: string;
  NR_CPF_CANDIDATO: string;
  SG_UF: string;
  SG_PARTIDO: string;
  DS_SIT_TOT_TURNO: string;
}): string {
  // Column positions (0-based) in the 54-column header that the pipeline reads:
  // SG_UF=10, DS_CARGO=14, NM_URNA_CANDIDATO=17, NR_CPF_CANDIDATO=19,
  // SG_PARTIDO=27, DS_SIT_TOT_TURNO=53
  const cols = Array(54).fill('');
  cols[10] = opts.SG_UF;
  cols[14] = opts.DS_CARGO;
  cols[17] = opts.NM_URNA_CANDIDATO;
  cols[19] = opts.NR_CPF_CANDIDATO;
  cols[27] = opts.SG_PARTIDO;
  cols[53] = opts.DS_SIT_TOT_TURNO;
  return cols.join(';');
}

/**
 * Build a zip buffer with a single CSV file named consulta_cand_2022_BRASIL.csv
 * containing the given candidate rows (latin1 encoded, header + rows).
 */
function buildTSEZip(rows: string[]): Buffer {
  const csvContent = [CSV_HEADER, ...rows].join('\n');
  const zip = new AdmZip();
  // The pipeline looks for files starting with 'consulta_cand_2022_' and ending with '.csv'
  zip.addFile('consulta_cand_2022_BRASIL.csv', Buffer.from(csvContent, 'latin1'));
  return zip.toBuffer();
}

/**
 * Generate a deterministically valid CPF for a given seed integer.
 * Uses the same algorithm as DeputiesPipeline tests.
 */
function makeCPF(id: number): string {
  const base = String(id).padStart(9, '0');
  const digits = base.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += digits[i] * (10 - i);
  let d1 = 11 - (sum % 11);
  if (d1 >= 10) d1 = 0;
  digits.push(d1);
  sum = 0;
  for (let i = 0; i < 10; i++) sum += digits[i] * (11 - i);
  let d2 = 11 - (sum % 11);
  if (d2 >= 10) d2 = 0;
  digits.push(d2);
  return digits.join('');
}

/** Stub the TSE CDN endpoint with the given zip buffer. */
function stubTSEZipDownload(zipBuffer: Buffer): void {
  nock(TSE_ORIGIN).get(TSE_ZIP_PATH).reply(200, zipBuffer, { 'content-type': 'application/zip' });
}

interface PoliticianRow {
  cpf: string;
  name: string;
  uf: string;
  role: string;
  party_id: string;
  elected_as: string | null;
  source_api_id: string | null;
}

interface CountRow {
  cnt: number;
}
interface PartyRow {
  id: string;
}

describe('TSE2022ElectionResultsPipeline Integration Tests', () => {
  const { getDb } = useTestDatabase();

  beforeEach(() => {
    nock.cleanAll();
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it('persists elected federal deputies and senators from TSE zip — happy path', async () => {
    const db = getDb().db;

    const deputyCpf = makeCPF(1);
    const senatorCpf = makeCPF(2);

    const rows = [
      // Elected federal deputy
      buildCandidateRow({
        DS_CARGO: 'DEPUTADO FEDERAL',
        NM_URNA_CANDIDATO: 'DEPUTADO TESTE',
        NR_CPF_CANDIDATO: deputyCpf,
        SG_UF: 'SP',
        SG_PARTIDO: 'PT',
        DS_SIT_TOT_TURNO: 'ELEITO POR QP',
      }),
      // Elected senator
      buildCandidateRow({
        DS_CARGO: 'SENADOR',
        NM_URNA_CANDIDATO: 'SENADOR TESTE',
        NR_CPF_CANDIDATO: senatorCpf,
        SG_UF: 'MG',
        SG_PARTIDO: 'MDB',
        DS_SIT_TOT_TURNO: 'ELEITO',
      }),
    ];

    stubTSEZipDownload(buildTSEZip(rows));

    const pipeline = new TSE2022ElectionResultsPipeline(db);
    await pipeline.execute(true);

    // Assert deputy persisted
    const deputy = db.prepare('SELECT * FROM politicians WHERE cpf = ?').get(deputyCpf) as
      | PoliticianRow
      | undefined;
    assert.ok(deputy, 'Deputy row should be persisted');
    assert.strictEqual(deputy.name, 'DEPUTADO TESTE', 'Deputy name should match NM_URNA_CANDIDATO');
    assert.strictEqual(deputy.uf, 'SP', 'Deputy UF should match SG_UF');
    assert.strictEqual(deputy.role, 'DEPUTY', 'DS_CARGO DEPUTADO FEDERAL maps to DEPUTY role');
    assert.strictEqual(deputy.party_id, 'pt', 'Party ID should be normalized to lowercase');
    assert.strictEqual(
      deputy.elected_as,
      'ELEITO_POR_QP',
      'elected_as should be the enum key for ELEITO POR QP',
    );
    assert.strictEqual(deputy.source_api_id, null, 'TSE pipeline does not set source_api_id');

    // Assert senator persisted
    const senator = db.prepare('SELECT * FROM politicians WHERE cpf = ?').get(senatorCpf) as
      | PoliticianRow
      | undefined;
    assert.ok(senator, 'Senator row should be persisted');
    assert.strictEqual(
      senator.name,
      'SENADOR TESTE',
      'Senator name should match NM_URNA_CANDIDATO',
    );
    assert.strictEqual(senator.uf, 'MG', 'Senator UF should match SG_UF');
    assert.strictEqual(senator.role, 'SENATOR', 'DS_CARGO SENADOR maps to SENATOR role');
    assert.strictEqual(senator.party_id, 'mdb', 'Party ID should be normalized to lowercase');
    assert.strictEqual(senator.elected_as, 'ELEITO', 'elected_as should be ELEITO');

    // Both parties should be created automatically
    const partyPT = db.prepare('SELECT * FROM parties WHERE id = ?').get('pt') as
      | PartyRow
      | undefined;
    assert.ok(partyPT, 'Party PT should be auto-created');
    const partyMDB = db.prepare('SELECT * FROM parties WHERE id = ?').get('mdb') as
      | PartyRow
      | undefined;
    assert.ok(partyMDB, 'Party MDB should be auto-created');

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('skips download when politicians table already has deputies and senators', async () => {
    const db = getDb().db;

    // Pre-seed both a deputy and a senator so shouldDownload() returns false
    db.prepare('INSERT OR IGNORE INTO parties (id, name, acronym) VALUES (?, ?, ?)').run(
      'pt',
      'PT',
      'PT',
    );
    db.prepare(
      `INSERT INTO politicians (cpf, source_api_id, name, uf, party_id, role, photo_url, elected_as)
       VALUES (?, NULL, ?, 'SP', 'pt', 'DEPUTY', NULL, 'ELEITO_POR_QP')`,
    ).run(makeCPF(10), 'Existing Deputy');
    db.prepare(
      `INSERT INTO politicians (cpf, source_api_id, name, uf, party_id, role, photo_url, elected_as)
       VALUES (?, NULL, ?, 'RJ', 'pt', 'SENATOR', NULL, 'ELEITO')`,
    ).run(makeCPF(11), 'Existing Senator');

    // No HTTP mocks — any network call would throw due to nock.disableNetConnect()
    const pipeline = new TSE2022ElectionResultsPipeline(db);
    await pipeline.execute(); // forceDownload defaults to false

    const count = (db.prepare('SELECT COUNT(*) as cnt FROM politicians').get() as CountRow).cnt;
    assert.strictEqual(count, 2, 'Politicians table should remain unchanged — no new rows added');
    assert.ok(nock.isDone(), 'No HTTP calls should have been made');
  });

  it('filters out non-elected candidates — only valid DS_SIT_TOT_TURNO values are stored', async () => {
    const db = getDb().db;

    const electedCpf = makeCPF(3);
    const nonElectedCpf = makeCPF(4);

    const rows = [
      // Valid elected status
      buildCandidateRow({
        DS_CARGO: 'DEPUTADO FEDERAL',
        NM_URNA_CANDIDATO: 'ELEITO CANDIDATO',
        NR_CPF_CANDIDATO: electedCpf,
        SG_UF: 'SP',
        SG_PARTIDO: 'PL',
        DS_SIT_TOT_TURNO: 'ELEITO',
      }),
      // Non-elected status — should be filtered out
      buildCandidateRow({
        DS_CARGO: 'DEPUTADO FEDERAL',
        NM_URNA_CANDIDATO: 'NAO ELEITO CANDIDATO',
        NR_CPF_CANDIDATO: nonElectedCpf,
        SG_UF: 'SP',
        SG_PARTIDO: 'PL',
        DS_SIT_TOT_TURNO: 'NÃO ELEITO',
      }),
    ];

    stubTSEZipDownload(buildTSEZip(rows));

    const pipeline = new TSE2022ElectionResultsPipeline(db);
    await pipeline.execute(true);

    const totalCount = (db.prepare('SELECT COUNT(*) as cnt FROM politicians').get() as CountRow)
      .cnt;
    assert.strictEqual(totalCount, 1, 'Only the elected candidate should be stored');

    const elected = db.prepare('SELECT * FROM politicians WHERE cpf = ?').get(electedCpf) as
      | PoliticianRow
      | undefined;
    assert.ok(elected, 'The elected candidate should be persisted');

    const nonElected = db.prepare('SELECT * FROM politicians WHERE cpf = ?').get(nonElectedCpf) as
      | PoliticianRow
      | undefined;
    assert.ok(!nonElected, 'The non-elected candidate should not be stored');

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('filters out non-federal cargo — only DEPUTADO FEDERAL and SENADOR are stored', async () => {
    const db = getDb().db;

    const deputadoFederalCpf = makeCPF(5);
    const deputadoEstadualCpf = makeCPF(6);
    const governadorCpf = makeCPF(7);

    const rows = [
      // Valid cargo — federal deputy
      buildCandidateRow({
        DS_CARGO: 'DEPUTADO FEDERAL',
        NM_URNA_CANDIDATO: 'DEPUTADO FEDERAL ELEITO',
        NR_CPF_CANDIDATO: deputadoFederalCpf,
        SG_UF: 'BA',
        SG_PARTIDO: 'PP',
        DS_SIT_TOT_TURNO: 'ELEITO POR QP',
      }),
      // Invalid cargo — state deputy (should be filtered)
      buildCandidateRow({
        DS_CARGO: 'DEPUTADO ESTADUAL',
        NM_URNA_CANDIDATO: 'DEPUTADO ESTADUAL ELEITO',
        NR_CPF_CANDIDATO: deputadoEstadualCpf,
        SG_UF: 'BA',
        SG_PARTIDO: 'PP',
        DS_SIT_TOT_TURNO: 'ELEITO POR QP',
      }),
      // Invalid cargo — governor (should be filtered)
      buildCandidateRow({
        DS_CARGO: 'GOVERNADOR',
        NM_URNA_CANDIDATO: 'GOVERNADOR ELEITO',
        NR_CPF_CANDIDATO: governadorCpf,
        SG_UF: 'BA',
        SG_PARTIDO: 'PP',
        DS_SIT_TOT_TURNO: 'ELEITO',
      }),
    ];

    stubTSEZipDownload(buildTSEZip(rows));

    const pipeline = new TSE2022ElectionResultsPipeline(db);
    await pipeline.execute(true);

    const totalCount = (db.prepare('SELECT COUNT(*) as cnt FROM politicians').get() as CountRow)
      .cnt;
    assert.strictEqual(totalCount, 1, 'Only the federal deputy should be stored');

    const deputadoFederal = db
      .prepare('SELECT * FROM politicians WHERE cpf = ?')
      .get(deputadoFederalCpf) as PoliticianRow | undefined;
    assert.ok(deputadoFederal, 'Federal deputy should be persisted');
    assert.strictEqual(deputadoFederal.role, 'DEPUTY');

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('filters out candidates with invalid CPF', async () => {
    const db = getDb().db;

    const validCpf = makeCPF(8);

    const rows = [
      // Valid CPF — should be stored
      buildCandidateRow({
        DS_CARGO: 'DEPUTADO FEDERAL',
        NM_URNA_CANDIDATO: 'CPF VALIDO',
        NR_CPF_CANDIDATO: validCpf,
        SG_UF: 'GO',
        SG_PARTIDO: 'PSDB',
        DS_SIT_TOT_TURNO: 'ELEITO',
      }),
      // Invalid CPF (all same digit) — should be filtered by isValidCPF
      buildCandidateRow({
        DS_CARGO: 'SENADOR',
        NM_URNA_CANDIDATO: 'CPF INVALIDO',
        NR_CPF_CANDIDATO: '00000000000',
        SG_UF: 'GO',
        SG_PARTIDO: 'PSDB',
        DS_SIT_TOT_TURNO: 'ELEITO',
      }),
    ];

    stubTSEZipDownload(buildTSEZip(rows));

    const pipeline = new TSE2022ElectionResultsPipeline(db);
    await pipeline.execute(true);

    const totalCount = (db.prepare('SELECT COUNT(*) as cnt FROM politicians').get() as CountRow)
      .cnt;
    assert.strictEqual(totalCount, 1, 'Only the candidate with a valid CPF should be stored');

    const validRow = db.prepare('SELECT * FROM politicians WHERE cpf = ?').get(validCpf) as
      | PoliticianRow
      | undefined;
    assert.ok(validRow, 'Candidate with valid CPF should be persisted');

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('stores all four valid elected statuses — ELEITO, ELEITO POR QP, ELEITO POR MÉDIA, SUPLENTE', async () => {
    const db = getDb().db;

    const cpfEleito = makeCPF(20);
    const cpfEleitoPorQP = makeCPF(21);
    const cpfEleitoPorMedia = makeCPF(22);
    const cpfSuplente = makeCPF(23);

    const rows = [
      buildCandidateRow({
        DS_CARGO: 'DEPUTADO FEDERAL',
        NM_URNA_CANDIDATO: 'ELEITO DIRETO',
        NR_CPF_CANDIDATO: cpfEleito,
        SG_UF: 'SP',
        SG_PARTIDO: 'PT',
        DS_SIT_TOT_TURNO: 'ELEITO',
      }),
      buildCandidateRow({
        DS_CARGO: 'DEPUTADO FEDERAL',
        NM_URNA_CANDIDATO: 'ELEITO POR QP',
        NR_CPF_CANDIDATO: cpfEleitoPorQP,
        SG_UF: 'SP',
        SG_PARTIDO: 'PT',
        DS_SIT_TOT_TURNO: 'ELEITO POR QP',
      }),
      buildCandidateRow({
        DS_CARGO: 'SENADOR',
        NM_URNA_CANDIDATO: 'ELEITO POR MEDIA',
        NR_CPF_CANDIDATO: cpfEleitoPorMedia,
        SG_UF: 'RJ',
        SG_PARTIDO: 'MDB',
        DS_SIT_TOT_TURNO: 'ELEITO POR MÉDIA',
      }),
      buildCandidateRow({
        DS_CARGO: 'SENADOR',
        NM_URNA_CANDIDATO: 'SUPLENTE SENADOR',
        NR_CPF_CANDIDATO: cpfSuplente,
        SG_UF: 'RJ',
        SG_PARTIDO: 'MDB',
        DS_SIT_TOT_TURNO: 'SUPLENTE',
      }),
    ];

    stubTSEZipDownload(buildTSEZip(rows));

    const pipeline = new TSE2022ElectionResultsPipeline(db);
    await pipeline.execute(true);

    const totalCount = (db.prepare('SELECT COUNT(*) as cnt FROM politicians').get() as CountRow)
      .cnt;
    assert.strictEqual(
      totalCount,
      4,
      'All four valid elected-status candidates should be persisted',
    );

    const eleito = db.prepare('SELECT elected_as FROM politicians WHERE cpf = ?').get(cpfEleito) as
      | { elected_as: string }
      | undefined;
    assert.ok(eleito);
    assert.strictEqual(eleito.elected_as, 'ELEITO');

    const eleitoPorQP = db
      .prepare('SELECT elected_as FROM politicians WHERE cpf = ?')
      .get(cpfEleitoPorQP) as { elected_as: string } | undefined;
    assert.ok(eleitoPorQP);
    assert.strictEqual(eleitoPorQP.elected_as, 'ELEITO_POR_QP');

    const eleitoPorMedia = db
      .prepare('SELECT elected_as FROM politicians WHERE cpf = ?')
      .get(cpfEleitoPorMedia) as { elected_as: string } | undefined;
    assert.ok(eleitoPorMedia);
    assert.strictEqual(eleitoPorMedia.elected_as, 'ELEITO_POR_MEDIA');

    const suplente = db
      .prepare('SELECT elected_as FROM politicians WHERE cpf = ?')
      .get(cpfSuplente) as { elected_as: string } | undefined;
    assert.ok(suplente);
    assert.strictEqual(suplente.elected_as, 'SUPLENTE');

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('force-download bypasses the shouldDownload check and re-populates politicians', async () => {
    const db = getDb().db;

    // Pre-seed a deputy so shouldDownload() would normally return false
    db.prepare('INSERT OR IGNORE INTO parties (id, name, acronym) VALUES (?, ?, ?)').run(
      'pt',
      'PT',
      'PT',
    );
    db.prepare(
      `INSERT INTO politicians (cpf, source_api_id, name, uf, party_id, role, photo_url, elected_as)
       VALUES (?, NULL, ?, 'SP', 'pt', 'DEPUTY', NULL, 'ELEITO_POR_QP')`,
    ).run(makeCPF(30), 'Pre-existing Deputy');

    const newCpf = makeCPF(31);
    const rows = [
      buildCandidateRow({
        DS_CARGO: 'DEPUTADO FEDERAL',
        NM_URNA_CANDIDATO: 'NOVO DEPUTADO',
        NR_CPF_CANDIDATO: newCpf,
        SG_UF: 'SC',
        SG_PARTIDO: 'PSD',
        DS_SIT_TOT_TURNO: 'ELEITO',
      }),
    ];

    stubTSEZipDownload(buildTSEZip(rows));

    const pipeline = new TSE2022ElectionResultsPipeline(db);
    await pipeline.execute(true); // forceDownload = true

    // Both the pre-existing and the newly added politician should be in the table
    const totalCount = (db.prepare('SELECT COUNT(*) as cnt FROM politicians').get() as CountRow)
      .cnt;
    assert.strictEqual(totalCount, 2, 'Both pre-existing and new politician should be present');

    const newDeputy = db.prepare('SELECT * FROM politicians WHERE cpf = ?').get(newCpf) as
      | PoliticianRow
      | undefined;
    assert.ok(newDeputy, 'New politician from force-download should be persisted');
    assert.strictEqual(newDeputy.name, 'NOVO DEPUTADO');
    assert.strictEqual(newDeputy.uf, 'SC');
    assert.strictEqual(newDeputy.party_id, 'psd');

    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });
});
