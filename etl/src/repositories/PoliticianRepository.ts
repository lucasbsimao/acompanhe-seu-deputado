import type Database from 'better-sqlite3';
import { PoliticianRole } from '../types/PoliticianRole';

export interface PoliticianRow {
  cpf: string;
  sourceApiId: string | null;
  name: string;
  uf: string;
  partyId: string;
  role: PoliticianRole;
  photoUrl: string | null;
  electedAs?: 'ELEITO POR QP' | 'ELEITO POR MÉDIA' | 'SUPLENTE' | null;
}

export class PoliticianRepository {
  private readonly insertParty: Database.Statement;
  private readonly insertPolitician: Database.Statement;
  private readonly insertAll: (rows: PoliticianRow[]) => void;
  private readonly countByRoleQuery: Database.Statement;

  constructor(db: Database.Database) {
    this.insertParty = db.prepare(
      'INSERT OR IGNORE INTO parties (id, name, acronym) VALUES (?, ?, ?)'
    );
    this.insertPolitician = db.prepare(
      'INSERT OR REPLACE INTO politicians (cpf, source_api_id, name, uf, party_id, role, photo_url, elected_as) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    this.countByRoleQuery = db.prepare('SELECT COUNT(*) as count FROM politicians WHERE role = ?');
    this.insertAll = db.transaction((rows: PoliticianRow[]) => {
      for (const r of rows) {
        this.insertParty.run(r.partyId, r.partyId, r.partyId);
        this.insertPolitician.run(r.cpf, r.sourceApiId, r.name, r.uf, r.partyId, r.role, r.photoUrl, r.electedAs || null);
      }
    });
  }

  insertBatch(rows: PoliticianRow[]): void {
    this.insertAll(rows);
  }

  countByRole(role: string): number {
    const result = this.countByRoleQuery.get(role) as { count: number };
    return result.count;
  }
}
