// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';
import { PoliticianRole } from '../types/PoliticianRole';
import type { TSEElectionResultStatusKey } from '../types/TSEElectionResultStatus';

export interface PoliticianRow {
  cpf: string;
  sourceApiId: string | null;
  name: string;
  uf: string;
  partyId: string;
  role: PoliticianRole;
  photoUrl: string | null;
  electedAs?: TSEElectionResultStatusKey | null;
}

export class PoliticianRepository {
  private readonly db: Database.Database;
  private readonly insertParty: Database.Statement;
  private readonly insertPolitician: Database.Statement;
  private readonly updatePolitician: Database.Statement;
  private readonly insertAll: (rows: PoliticianRow[]) => void;
  private readonly updateAll: (rows: PoliticianRow[]) => void;
  private readonly countByRoleQuery: Database.Statement;
  private readonly countByRoleWithSourceApiIdQuery: Database.Statement;
  private readonly updateSourceApiIdStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;
    this.insertParty = db.prepare(
      'INSERT OR IGNORE INTO parties (id, name, acronym) VALUES (?, ?, ?)',
    );
    this.insertPolitician = db.prepare(
      'INSERT OR REPLACE INTO politicians (cpf, source_api_id, name, uf, party_id, role, photo_url, elected_as) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    this.updatePolitician = db.prepare(
      'UPDATE politicians SET source_api_id = ?, uf = ?, party_id = ?, photo_url = ? WHERE cpf = ?',
    );
    this.countByRoleQuery = db.prepare('SELECT COUNT(*) as count FROM politicians WHERE role = ?');
    this.countByRoleWithSourceApiIdQuery = db.prepare(
      'SELECT COUNT(*) as count FROM politicians WHERE role = ? AND source_api_id IS NOT NULL',
    );
    this.updateSourceApiIdStmt = db.prepare(
      'UPDATE politicians SET source_api_id = ? WHERE cpf = ?',
    );
    this.insertAll = db.transaction((rows: PoliticianRow[]) => {
      for (const r of rows) {
        this.insertParty.run(r.partyId, r.partyId, r.partyId);
        this.insertPolitician.run(
          r.cpf,
          r.sourceApiId,
          r.name,
          r.uf,
          r.partyId,
          r.role,
          r.photoUrl,
          r.electedAs ?? null,
        );
      }
    });
    this.updateAll = db.transaction((rows: PoliticianRow[]) => {
      for (const r of rows) {
        this.insertParty.run(r.partyId, r.partyId, r.partyId);
        this.updatePolitician.run(r.sourceApiId, r.uf, r.partyId, r.photoUrl, r.cpf);
      }
    });
  }

  insertBatch(rows: PoliticianRow[]): void {
    this.insertAll(rows);
  }

  updateBatch(rows: PoliticianRow[]): void {
    this.updateAll(rows);
  }

  countByRole(role: string): number {
    const result = this.countByRoleQuery.get(role) as { count: number };
    return result.count;
  }

  countByRoleWithSourceApiId(role: string): number {
    const result = this.countByRoleWithSourceApiIdQuery.get(role) as { count: number };
    return result.count;
  }

  getAllForLookup(): Array<{
    cpf: string;
    name: string;
    uf: string;
    role: string;
    partyId: string;
  }> {
    const query = this.db.prepare(
      'SELECT cpf, name, uf, role, party_id as partyId FROM politicians',
    );
    return query.all() as Array<{
      cpf: string;
      name: string;
      uf: string;
      role: string;
      partyId: string;
    }>;
  }

  getSenatorCodeToCpfMap(): Map<string, string> {
    const rows = this.db
      .prepare(
        'SELECT cpf, source_api_id FROM politicians WHERE role = ? AND source_api_id IS NOT NULL',
      )
      .all(PoliticianRole.SENATOR) as Array<{ cpf: string; source_api_id: string }>;

    return new Map(rows.map(r => [r.source_api_id, r.cpf]));
  }

  updateSourceApiId(cpf: string, sourceApiId: string): void {
    this.updateSourceApiIdStmt.run(sourceApiId, cpf);
  }
}
