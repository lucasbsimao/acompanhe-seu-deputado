// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';

export interface TseCandidateRow {
  cpf: string;
  nome: string;
  cargo: string;
  partido: string;
  ano_eleicao: string;
  uf: string;
}

export class TseCandidatesRepository {
  private readonly db: Database.Database;
  private readonly insertCandidate: Database.Statement;
  private readonly insertAll: (rows: TseCandidateRow[]) => void;

  constructor(db: Database.Database) {
    this.db = db;
    this.insertCandidate = db.prepare(`
      INSERT OR REPLACE INTO tse_candidates (
        cpf, nome, cargo, partido, ano_eleicao, uf
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    this.insertAll = db.transaction((rows: TseCandidateRow[]) => {
      for (const r of rows) {
        this.insertCandidate.run(r.cpf, r.nome, r.cargo, r.partido, r.ano_eleicao, r.uf);
      }
    });
  }

  insertBatch(rows: TseCandidateRow[]): void {
    this.insertAll(rows);
  }

  count(): number {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM tse_candidates').get() as {
      count: number;
    };
    return result.count;
  }

  getAllCpfs(): Set<string> {
    const rows = this.db.prepare('SELECT cpf FROM tse_candidates').all() as { cpf: string }[];
    return new Set(rows.map(r => r.cpf));
  }
}
