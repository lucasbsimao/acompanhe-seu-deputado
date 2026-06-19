// SPDX-License-Identifier: AGPL-3.0-or-later

import type { PoliticianRepository } from '../repositories/PoliticianRepository';
import { normalizeNameForMatching } from '../util/normalization.util';

export class PoliticianLookupService {
  private readonly compositeToCpfMap: Map<string, string>;
  private readonly politicianRepository: PoliticianRepository;

  constructor(politicianRepository: PoliticianRepository) {
    this.politicianRepository = politicianRepository;
    this.compositeToCpfMap = new Map();
    this.loadPoliticians();
  }

  private loadPoliticians(): void {
    const politicians = this.politicianRepository.getAllForLookup();

    for (const politician of politicians) {
      const key = this.buildKey(politician.name, politician.uf, politician.role);

      if (this.compositeToCpfMap.has(key)) {
        console.warn(`Duplicate composite key found: ${key} (${politician.name})`);
      }

      this.compositeToCpfMap.set(key, politician.cpf);
    }

    console.log(`Loaded ${this.compositeToCpfMap.size} politicians for lookup`);
  }

  private buildKey(name: string, uf: string, role: string): string {
    const normalizedName = normalizeNameForMatching(name);
    const normalizedUf = uf.trim().toUpperCase();
    const normalizedRole = role.trim().toUpperCase();

    return `${normalizedName}-${normalizedUf}-${normalizedRole}`;
  }

  findCpf(name: string, uf: string, role: string): string | null {
    const key = this.buildKey(name, uf, role);
    return this.compositeToCpfMap.get(key) ?? null;
  }

  /**
   * @deprecated Use findCpf instead.
   */
  findCpfByNormalizedName(autorName: string | null): string | null {
    if (!autorName) {
      return null;
    }

    const normalizedAutor = normalizeNameForMatching(autorName);
    const matches: string[] = [];

    // Fallback search: find any match with this name.
    for (const [key, cpf] of this.compositeToCpfMap.entries()) {
      if (key.startsWith(`${normalizedAutor}-`)) {
        matches.push(cpf);
      }
    }

    if (matches.length > 1) {
      console.warn(
        `Ambiguous lookup for name "${autorName}": ${matches.length} matches found. Use findCpf with full context instead.`,
      );
      return null; // Don't return an arbitrary one if ambiguous
    }

    return matches[0] ?? null;
  }
}
