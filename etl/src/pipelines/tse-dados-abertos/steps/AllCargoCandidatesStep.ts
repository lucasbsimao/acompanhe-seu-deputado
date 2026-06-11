// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';
import { TseCandidatesRepository } from '../../../repositories/TseCandidatesRepository';
import { normalizeCPF, isValidCPF } from '../../../util/cpf.util';
import type { TSECandidate } from '../../../types/TSECandidate';

export class AllCargoCandidatesStep {
  private readonly repo: TseCandidatesRepository;

  constructor(db: Database.Database) {
    this.repo = new TseCandidatesRepository(db);
  }

  run(candidates: TSECandidate[]): void {
    const validCandidates = candidates
      .filter(c => isValidCPF(c.NR_CPF_CANDIDATO))
      .map(c => ({
        cpf: normalizeCPF(c.NR_CPF_CANDIDATO),
        nome: c.NM_URNA_CANDIDATO,
        cargo: c.DS_CARGO,
        partido: c.SG_PARTIDO,
        ano_eleicao: c.ANO_ELEICAO,
        uf: c.SG_UF,
      }));

    this.repo.insertBatch(validCandidates);
  }
}
