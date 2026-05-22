import { PoliticianRepository } from '../repositories/PoliticianRepository';
import { normalizeNameForMatching } from '../util/normalization.util';

export class PoliticianLookupService {
  private readonly nameToCpfMap: Map<string, string>;
  private readonly politicianRepository: PoliticianRepository;

  constructor(politicianRepository: PoliticianRepository) {
    this.politicianRepository = politicianRepository;
    this.nameToCpfMap = new Map();
    this.loadPoliticians();
  }

  private loadPoliticians(): void {
    const politicians = this.politicianRepository.getAllForLookup();

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
