// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';
import { PoliticianRole } from '../../src/types/PoliticianRole';

export function makeCPF(id: number): string {
  const base = String(id).padStart(9, '0');
  const digits = base.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += digits[i] * (10 - i);
  }
  let d1 = 11 - (sum % 11);
  if (d1 >= 10) d1 = 0;
  digits.push(d1);
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += digits[i] * (11 - i);
  }
  let d2 = 11 - (sum % 11);
  if (d2 >= 10) d2 = 0;
  digits.push(d2);
  return digits.join('');
}

export interface SeedDeputyOptions {
  name?: string;
  sourceApiId?: string | null;
  uf?: string;
}

export interface SeedSenatorOptions {
  name?: string;
  sourceApiId?: string | null;
  uf?: string;
  electedAs?: string;
}

export interface TestPoliticianSeed {
  cpf: string;
  sourceApiId?: string | null;
  name?: string;
  role: PoliticianRole;
  uf?: string;
  electedAs?: string;
}

export class TestPoliticianRepository {
  constructor(private readonly db: Database.Database) {}

  private seedParty(id: string = 'pt', acronym: string = 'PT'): void {
    this.db
      .prepare('INSERT OR IGNORE INTO parties (id, name, acronym) VALUES (?, ?, ?)')
      .run(id, acronym, acronym);
  }

  seedDeputy(cpf: string, options: SeedDeputyOptions = {}): void {
    const { name = `Deputy ${cpf}`, sourceApiId = cpf, uf = 'SP' } = options;
    this.seedParty();
    this.db
      .prepare(
        `INSERT OR IGNORE INTO politicians (cpf, source_api_id, name, uf, party_id, role, photo_url, elected_as)
         VALUES (?, ?, ?, ?, 'pt', ?, NULL, 'ELEITO_POR_QP')`,
      )
      .run(cpf, sourceApiId, name, uf, PoliticianRole.DEPUTY);
  }

  seedSenator(cpf: string, options: SeedSenatorOptions = {}): void {
    const {
      name = `Senator ${cpf}`,
      sourceApiId = null,
      uf = 'SP',
      electedAs = 'ELEITO',
    } = options;
    this.seedParty();
    this.db
      .prepare(
        `INSERT OR IGNORE INTO politicians (cpf, source_api_id, name, uf, party_id, role, photo_url, elected_as)
         VALUES (?, ?, ?, ?, 'pt', ?, NULL, ?)`,
      )
      .run(cpf, sourceApiId, name, uf, PoliticianRole.SENATOR, electedAs);
  }

  seedTSEDeputyRows(count: number): void {
    this.seedParty();
    const insert = this.db.prepare(
      `INSERT INTO politicians (cpf, source_api_id, name, uf, party_id, role, photo_url, elected_as)
       VALUES (?, NULL, ?, 'SP', 'pt', 'DEPUTY', NULL, 'ELEITO_POR_QP')`,
    );
    const insertAll = this.db.transaction((n: number) => {
      for (let i = 1; i <= n; i++) {
        insert.run(makeCPF(i), `TSE Deputy ${i}`);
      }
    });
    insertAll(count);
  }

  seedTSESenatorRows(count: number, uf: string = 'SP', partyId: string = 'pt'): void {
    this.seedParty(partyId.toLowerCase(), partyId.toUpperCase());
    const insert = this.db.prepare(
      `INSERT INTO politicians (cpf, source_api_id, name, uf, party_id, role, photo_url, elected_as)
       VALUES (?, NULL, ?, ?, ?, 'SENATOR', NULL, 'ELEITO_POR_QP')`,
    );
    const insertAll = this.db.transaction((n: number) => {
      for (let i = 1; i <= n; i++) {
        insert.run(makeCPF(i), `Senator ${i}`, uf, partyId.toLowerCase());
      }
    });
    insertAll(count);
  }

  seedTSESenatorByName(id: number, name: string, uf: string = 'SP', partyId: string = 'pt'): void {
    this.seedParty(partyId.toLowerCase(), partyId.toUpperCase());
    this.db
      .prepare(
        `INSERT INTO politicians (cpf, source_api_id, name, uf, party_id, role, photo_url, elected_as)
         VALUES (?, NULL, ?, ?, ?, 'SENATOR', NULL, 'ELEITO_POR_QP')`,
      )
      .run(makeCPF(id), name, uf, partyId.toLowerCase());
  }

  seedBatch(seeds: TestPoliticianSeed[]): void {
    this.seedParty();
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO politicians (cpf, source_api_id, name, uf, party_id, role, photo_url, elected_as)
       VALUES (?, ?, ?, ?, 'pt', ?, NULL, ?)`,
    );

    this.db.transaction(() => {
      for (const s of seeds) {
        insert.run(
          s.cpf,
          s.sourceApiId ?? null,
          s.name ?? `Politician ${s.cpf}`,
          s.uf ?? 'SP',
          s.role,
          s.electedAs ?? 'ELEITO_POR_QP',
        );
      }
    })();
  }
}
