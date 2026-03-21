import { PaginationEngine } from '../core/PaginationEngine';
import { PartyRepository } from '../repositories/PartyRepository';
import type Database from 'better-sqlite3';

interface PartyData {
  id: number;
  sigla: string;
  nome: string;
  uri: string;
}

interface ApiResponse {
  dados: PartyData[];
}

export class PartiesPipeline extends PaginationEngine<PartyData> {
  private readonly apiEndpoint = 'https://dadosabertos.camara.leg.br/api/v2/partidos';
  private readonly repo: PartyRepository;

  private normalizeId(id: string): string {
    return id
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  constructor(db: Database.Database) {
    super({
      pageSize: 100,
      parallelism: 10,
      maxRetries: 3,
      retryWaitMin: 250,
      retryWaitMax: 2000,
    });
    this.repo = new PartyRepository(db);
  }

  async buildUrl(page: number, pageSize: number): Promise<string> {
    const url = new URL(this.apiEndpoint);
    url.searchParams.set('ordem', 'ASC');
    url.searchParams.set('ordenarPor', 'sigla');
    url.searchParams.set('pagina', String(page));
    url.searchParams.set('itens', String(pageSize));
    return url.toString();
  }

  async decodePage(data: unknown): Promise<PartyData[]> {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid response data');
    }

    const response = data as ApiResponse;
    if (!Array.isArray(response.dados)) {
      throw new Error('Response does not contain dados array');
    }

    return response.dados;
  }

  async extractTotalCount(headers: Record<string, string>): Promise<number> {
    const totalCountHeader = headers['x-total-count'];
    if (!totalCountHeader) {
      throw new Error('Missing X-Total-Count header');
    }

    const totalCount = parseInt(totalCountHeader, 10);
    if (isNaN(totalCount)) {
      throw new Error('Invalid X-Total-Count header value');
    }

    return totalCount;
  }

  protected async onPageFetched(items: PartyData[]): Promise<void> {
    this.repo.insertBatch(
      items.map(d => ({
        id: this.normalizeId(d.sigla),
        name: d.nome,
        acronym: d.sigla,
      }))
    );
  }
}
