import type { Politician } from '../domain/politician';
import { PoliticianRepository } from '../repositories/politicianRepository';

export class PoliticianService {
  constructor(private repo: PoliticianRepository) {}

  async insertBatch(politicians: Politician[]): Promise<void> {
    try {
      await this.repo.insertBatch(politicians);
    } catch (error) {
      throw new Error(`Failed to insert politicians: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getAllIds(): Promise<string[]> {
    try {
      return await this.repo.findAllIds();
    } catch (error) {
      throw new Error(`Failed to retrieve politician IDs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
