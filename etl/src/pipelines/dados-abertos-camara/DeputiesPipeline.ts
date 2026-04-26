import { BasePipeline } from './BasePipeline';
import { PoliticianRepository } from '../../repositories/PoliticianRepository';
import type Database from 'better-sqlite3';
import { normalizeId } from '../../util/normalization.util';
import { normalizeCPF, isValidCPF } from '../../util/cpf.util';
import { PoliticianRole } from '../../types/PoliticianRole';

interface PoliticianData {
  id: number;
  nome: string;
  siglaPartido: string;
  siglaUf: string;
  urlFoto: string;
}

interface DeputyDetail {
  dados: {
    id: number;
    nomeCivil: string;
    cpf: string;
    siglaPartido: string;
    siglaUf: string;
    urlFoto: string;
  };
}

interface ApiResponse {
  dados: PoliticianData[];
}

export class DeputiesPipeline extends BasePipeline<PoliticianData> {
  private readonly apiEndpoint = 'https://dadosabertos.camara.leg.br/api/v2/deputados';
  private readonly repo: PoliticianRepository;

  constructor(db: Database.Database) {
    super({
      pageSize: 100,
      parallelism: 10,
      maxRetries: 3,
      retryWaitMin: 250,
      retryWaitMax: 2000,
    });
    this.repo = new PoliticianRepository(db);
  }

  async buildUrl(page: number, pageSize: number): Promise<string> {
    const url = new URL(this.apiEndpoint);
    url.searchParams.set('ordem', 'ASC');
    url.searchParams.set('ordenarPor', 'nome');
    url.searchParams.set('pagina', String(page));
    url.searchParams.set('itens', String(pageSize));
    return url.toString();
  }

  async decodePage(data: unknown): Promise<PoliticianData[]> {
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

  async shouldDownload(): Promise<boolean> {
    return this.repo.countByRole(PoliticianRole.DEPUTY) === 0;
  }

  async onPageFetched(items: PoliticianData[]): Promise<void> {
    const detailedDeputies = await Promise.all(
      items.map(async (d) => {
        const detailUrl = `https://dadosabertos.camara.leg.br/api/v2/deputados/${d.id}`;
        const { data } = await this.httpClient.request(detailUrl);
        const detail = data as DeputyDetail;
        return {
          cpf: normalizeCPF(detail.dados.cpf),
          sourceApiId: String(d.id),
          name: d.nome,
          uf: d.siglaUf,
          partyId: normalizeId(d.siglaPartido),
          role: PoliticianRole.DEPUTY,
          photoUrl: d.urlFoto || null,
        };
      })
    );
    
    this.repo.insertBatch(detailedDeputies.filter(d => isValidCPF(d.cpf)));
  }
}
