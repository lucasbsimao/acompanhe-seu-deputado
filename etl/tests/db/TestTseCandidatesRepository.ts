// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';

export class TestTseCandidatesRepository {
  constructor(private readonly db: Database.Database) {}

  seedCandidate(params: {
    cpf: string;
    nome: string;
    cargo?: string;
    partido?: string;
    anoEleicao?: string;
    uf?: string;
  }): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO tse_candidates (cpf, nome, cargo, partido, ano_eleicao, uf)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        params.cpf,
        params.nome,
        params.cargo ?? 'DEPUTADO FEDERAL',
        params.partido ?? 'PARTIDO X',
        params.anoEleicao ?? '2022',
        params.uf ?? 'DF',
      );
  }
}
