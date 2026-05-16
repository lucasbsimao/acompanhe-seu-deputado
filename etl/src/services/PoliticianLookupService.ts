import type Database from 'better-sqlite3';
import { normalizeNameForMatching } from '../util/normalization.util';

export class PoliticianLookupService {
  private readonly nameToCpfMap: Map<string, string>;

  constructor(db: Database.Database) {
    this.nameToCpfMap = new Map();
    this.loadPoliticians(db);
  }

  private loadPoliticians(db: Database.Database): void {
    const politicians = db
      .prepare('SELECT cpf, name FROM politicians')
      .all() as Array<{ cpf: string; name: string }>;

    for (const politician of politicians) {
      const normalizedName = normalizeNameForMatching(politician.name);
      
      if (this.nameToCpfMap.has(normalizedName)) {
        console.warn(`Duplicate normalized name found: ${normalizedName} (${politician.name})`);
      }
      
      this.nameToCpfMap.set(normalizedName, politician.cpf);
    }

    console.log(`Loaded ${this.nameToCpfMap.size} politicians for lookup`);
  }

  findCpfByNormalizedName(autorName: string | null): string | null {
    if (!autorName) {
      return null;
    }

    const normalizedAutor = normalizeNameForMatching(autorName);
    return this.nameToCpfMap.get(normalizedAutor) || null;
  }
}
