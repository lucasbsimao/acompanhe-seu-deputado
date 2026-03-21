import type Database from 'better-sqlite3';

export interface PartyRow {
  id: string;
  name: string;
  acronym: string;
}

export class PartyRepository {
  private readonly insertParty: Database.Statement;
  private readonly insertAll: (rows: PartyRow[]) => void;
  private readonly countQuery: Database.Statement;

  constructor(db: Database.Database) {
    this.insertParty = db.prepare(
      'INSERT OR REPLACE INTO parties (id, name, acronym) VALUES (?, ?, ?)'
    );
    this.countQuery = db.prepare('SELECT COUNT(*) as count FROM parties');
    this.insertAll = db.transaction((rows: PartyRow[]) => {
      for (const r of rows) {
        this.insertParty.run(r.id, r.name, r.acronym);
      }
    });
  }

  insertBatch(rows: PartyRow[]): void {
    this.insertAll(rows);
  }

  count(): number {
    const result = this.countQuery.get() as { count: number };
    return result.count;
  }
}
