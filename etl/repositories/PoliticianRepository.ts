import type Database from 'better-sqlite3';

export interface PoliticianRow {
  id: string;
  name: string;
  uf: string;
  partyId: string;
  role: string;
  photoUrl: string | null;
}

export class PoliticianRepository {
  private readonly insertParty: Database.Statement;
  private readonly insertPolitician: Database.Statement;
  private readonly insertAll: (rows: PoliticianRow[]) => void;

  constructor(db: Database.Database) {
    this.insertParty = db.prepare(
      'INSERT OR IGNORE INTO parties (id, name, acronym) VALUES (?, ?, ?)'
    );
    this.insertPolitician = db.prepare(
      'INSERT OR REPLACE INTO politicians (id, name, uf, party_id, role, photo_url) VALUES (?, ?, ?, ?, ?, ?)'
    );
    this.insertAll = db.transaction((rows: PoliticianRow[]) => {
      for (const r of rows) {
        this.insertParty.run(r.partyId, r.partyId, r.partyId);
        this.insertPolitician.run(r.id, r.name, r.uf, r.partyId, r.role, r.photoUrl);
      }
    });
  }

  insertBatch(rows: PoliticianRow[]): void {
    this.insertAll(rows);
  }
}
