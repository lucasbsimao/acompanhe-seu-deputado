import type Database from 'better-sqlite3';
import { normalizeNameForMatching } from '../util/normalization.util';

export class PoliticianLookupService {
  private readonly nameToIdMap: Map<string, string>;

  constructor(db: Database.Database) {
    this.nameToIdMap = new Map();
    this.loadPoliticians(db);
  }

  private loadPoliticians(db: Database.Database): void {
    const politicians = db
      .prepare('SELECT id, name FROM politicians WHERE role = ?')
      .all('DEPUTY') as Array<{ id: string; name: string }>;

    for (const politician of politicians) {
      const normalizedName = normalizeNameForMatching(politician.name);
      
      if (this.nameToIdMap.has(normalizedName)) {
        console.warn(`Duplicate normalized name found: ${normalizedName} (${politician.name})`);
      }
      
      this.nameToIdMap.set(normalizedName, politician.id);
    }

    console.log(`Loaded ${this.nameToIdMap.size} politicians for lookup`);
  }

  findByNormalizedName(autorName: string | null): string | null {
    if (!autorName) {
      return null;
    }

    const normalizedAutor = normalizeNameForMatching(autorName);
    return this.nameToIdMap.get(normalizedAutor) || null;
  }
}
