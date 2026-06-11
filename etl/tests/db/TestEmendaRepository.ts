// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';

export class TestEmendaRepository {
  constructor(private readonly db: Database.Database) {}

  seedEmenda(codigoEmenda: string, ano: number): void {
    this.db
      .prepare(`INSERT INTO emendas_parlamentares (codigo_emenda, ano) VALUES (?, ?)`)
      .run(codigoEmenda, ano);
  }
}
