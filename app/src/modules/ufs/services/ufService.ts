import type { Uf } from '../domain/uf';
import { UfRepository } from '../repositories/ufRepository';
import { NotFoundError } from '../../../shared/errors';

export class UfService {
  constructor(private repo: UfRepository) {}

  async list(): Promise<Uf[]> {
    return this.repo.list();
  }

  async get(uf: string): Promise<Uf> {
    const found = await this.repo.getByUf(uf);
    if (!found) {
      throw new NotFoundError('UF not found');
    }
    return found;
  }
}
