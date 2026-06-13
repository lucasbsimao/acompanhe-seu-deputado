// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';

export interface TseDonationRow {
  donor_cpf: string;
  recipient_cpf: string;
  ano_eleicao: number;
  valor: number;
}

export class TseDonationsRepository {
  private readonly db: Database.Database;
  private readonly insertDonation: Database.Statement;
  private readonly insertAll: (rows: TseDonationRow[]) => void;

  constructor(db: Database.Database) {
    this.db = db;
    this.insertDonation = db.prepare(`
      INSERT INTO tse_donations (
        donor_cpf, recipient_cpf, ano_eleicao, valor
      ) VALUES (?, ?, ?, ?)
    `);

    this.insertAll = db.transaction((rows: TseDonationRow[]) => {
      for (const r of rows) {
        this.insertDonation.run(r.donor_cpf, r.recipient_cpf, r.ano_eleicao, r.valor);
      }
    });
  }

  insertBatch(rows: TseDonationRow[]): void {
    this.insertAll(rows);
  }

  count(): number {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM tse_donations').get() as {
      count: number;
    };
    return result.count;
  }
}
