// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';

export class TestTseDonationsRepository {
  constructor(private readonly db: Database.Database) {}

  seedDonation(params: {
    donor_cpf: string;
    recipient_cpf: string;
    ano_eleicao: number;
    valor: number;
  }): void {
    this.db
      .prepare(
        `INSERT INTO tse_donations (donor_cpf, recipient_cpf, ano_eleicao, valor)
         VALUES (?, ?, ?, ?)`,
      )
      .run(params.donor_cpf, params.recipient_cpf, params.ano_eleicao, params.valor);
  }
}
