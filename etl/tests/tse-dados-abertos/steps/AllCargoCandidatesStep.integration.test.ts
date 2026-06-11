// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { AllCargoCandidatesStep } from '../../../src/pipelines/tse-dados-abertos/steps/AllCargoCandidatesStep';
import { TseCandidatesRepository } from '../../../src/repositories/TseCandidatesRepository';
import type { TSECandidate } from '../../../src/types/TSECandidate';
import { migrations } from '../../../../app/src/shared/db/migrations';
import { makeCPF } from '../../db/TestPoliticianRepository';

describe('AllCargoCandidatesStep', () => {
  let db: Database.Database;
  let repo: TseCandidatesRepository;
  let step: AllCargoCandidatesStep;

  beforeEach(() => {
    db = new Database(':memory:');

    // Create migrations table
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Apply all migrations
    for (const { sql } of migrations) {
      db.exec(sql);
    }

    repo = new TseCandidatesRepository(db);
    step = new AllCargoCandidatesStep(db);
  });

  it('stores all valid candidates regardless of cargo', () => {
    const cpf1 = makeCPF(1);
    const cpf2 = makeCPF(2);
    const candidates: TSECandidate[] = [
      {
        ANO_ELEICAO: '2022',
        DS_CARGO: 'DEPUTADO FEDERAL',
        NR_CPF_CANDIDATO: cpf1,
        NM_URNA_CANDIDATO: 'CANDIDATO 1',
        SG_UF: 'SP',
        SG_PARTIDO: 'PT',
        DS_SIT_TOT_TURNO: 'ELEITO',
      },
      {
        ANO_ELEICAO: '2022',
        DS_CARGO: 'GOVERNADOR',
        NR_CPF_CANDIDATO: cpf2,
        NM_URNA_CANDIDATO: 'CANDIDATO 2',
        SG_UF: 'RJ',
        SG_PARTIDO: 'PL',
        DS_SIT_TOT_TURNO: 'NÃO ELEITO',
      },
    ];

    step.run(candidates);

    assert.strictEqual(repo.count(), 2);

    const stored = db.prepare('SELECT * FROM tse_candidates ORDER BY cpf').all() as any[];
    assert.strictEqual(stored[0].cpf, cpf1);
    assert.strictEqual(stored[0].cargo, 'DEPUTADO FEDERAL');
    assert.strictEqual(stored[1].cpf, cpf2);
    assert.strictEqual(stored[1].cargo, 'GOVERNADOR');
  });

  it('skips candidates with invalid CPF (including "-4" sentinel)', () => {
    const validCpf = makeCPF(3);
    const candidates: TSECandidate[] = [
      {
        ANO_ELEICAO: '2022',
        DS_CARGO: 'DEPUTADO FEDERAL',
        NR_CPF_CANDIDATO: '-4', // TSE sentinel
        NM_URNA_CANDIDATO: 'SENTINEL',
        SG_UF: 'SP',
        SG_PARTIDO: 'PT',
        DS_SIT_TOT_TURNO: 'ELEITO',
      },
      {
        ANO_ELEICAO: '2022',
        DS_CARGO: 'DEPUTADO FEDERAL',
        NR_CPF_CANDIDATO: '123', // Too short
        NM_URNA_CANDIDATO: 'INVALID',
        SG_UF: 'SP',
        SG_PARTIDO: 'PT',
        DS_SIT_TOT_TURNO: 'ELEITO',
      },
      {
        ANO_ELEICAO: '2022',
        DS_CARGO: 'DEPUTADO FEDERAL',
        NR_CPF_CANDIDATO: validCpf,
        NM_URNA_CANDIDATO: 'VALID',
        SG_UF: 'SP',
        SG_PARTIDO: 'PT',
        DS_SIT_TOT_TURNO: 'ELEITO',
      },
    ];

    step.run(candidates);

    assert.strictEqual(repo.count(), 1);
    const stored = db.prepare('SELECT * FROM tse_candidates').get() as any;
    assert.strictEqual(stored.cpf, validCpf);
  });

  it('performs idempotent upsert (INSERT OR REPLACE)', () => {
    const cpf = makeCPF(4);
    const candidates1: TSECandidate[] = [
      {
        ANO_ELEICAO: '2022',
        DS_CARGO: 'DEPUTADO FEDERAL',
        NR_CPF_CANDIDATO: cpf,
        NM_URNA_CANDIDATO: 'NAME V1',
        SG_UF: 'SP',
        SG_PARTIDO: 'PT',
        DS_SIT_TOT_TURNO: 'ELEITO',
      },
    ];

    step.run(candidates1);
    assert.strictEqual(repo.count(), 1);

    const candidates2: TSECandidate[] = [
      {
        ANO_ELEICAO: '2022',
        DS_CARGO: 'DEPUTADO FEDERAL',
        NR_CPF_CANDIDATO: cpf,
        NM_URNA_CANDIDATO: 'NAME V2', // Updated name
        SG_UF: 'SP',
        SG_PARTIDO: 'PT',
        DS_SIT_TOT_TURNO: 'ELEITO',
      },
    ];

    step.run(candidates2);
    assert.strictEqual(repo.count(), 1);

    const stored = db.prepare('SELECT * FROM tse_candidates').get() as any;
    assert.strictEqual(stored.nome, 'NAME V2');
  });
});
