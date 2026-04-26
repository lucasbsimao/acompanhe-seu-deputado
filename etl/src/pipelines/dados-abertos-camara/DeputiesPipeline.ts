import { BasePipeline } from './BasePipeline';
import { PoliticianRepository } from '../../repositories/PoliticianRepository';
import type Database from 'better-sqlite3';
import { normalizeId } from '../../util/normalization.util';
import { normalizeCPF, isValidCPF } from '../../util/cpf.util';
import { PoliticianRole } from '../../types/PoliticianRole';
import defaultConfig from '../../config/defaults.json';

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

interface LegislaturaResponse {
  dados: { id: number }[];
}

export class DeputiesPipeline extends BasePipeline<PoliticianData> {
  private readonly apiEndpoint = 'https://dadosabertos.camara.leg.br/api/v2/deputados';
  private readonly legislaturasEndpoint = 'https://dadosabertos.camara.leg.br/api/v2/legislaturas';
  private readonly repo: PoliticianRepository;
  private readonly legislaturasToFetch: number;
  private currentLegislaturaId: number | null = null;

  constructor(db: Database.Database, legislaturasToFetch?: number) {
    super({
      pageSize: 100,
      parallelism: 10,
      maxRetries: 3,
      retryWaitMin: 250,
      retryWaitMax: 2000,
    });
    this.repo = new PoliticianRepository(db);
    this.legislaturasToFetch = legislaturasToFetch ?? defaultConfig.deputies.legislaturasToFetch;
  }

  // Overrides the base execute to loop over the last N legislatures.
  // shouldDownload is checked once; if we proceed, each legislature is fetched with force=true
  // so the base class does not skip subsequent legislatures after the first inserts data.
  // Deputies who served across multiple terms are deduplicated by CPF via INSERT OR REPLACE.
  override async execute(forceDownload = false): Promise<void> {
    if (!forceDownload && !(await this.shouldDownload())) {
      console.log('Data already exists, skipping download. Use --force-download to override.');
      return;
    }

    const legislaturaIds = await this.fetchLegislaturaIds();
    for (const id of legislaturaIds) {
      this.currentLegislaturaId = id;
      console.log(`Fetching deputies for legislature ${id}...`);
      await super.execute(true);
    }
  }

  async buildUrl(page: number, pageSize: number): Promise<string> {
    const url = new URL(this.apiEndpoint);
    url.searchParams.set('ordem', 'ASC');
    url.searchParams.set('ordenarPor', 'id');
    url.searchParams.set('pagina', String(page));
    url.searchParams.set('itens', String(pageSize));
    if (this.currentLegislaturaId !== null) {
      url.searchParams.set('idLegislatura', String(this.currentLegislaturaId));
    }
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
    const unique = Array.from(new Map(items.map(d => [d.id, d])).values());
    const detailedDeputies = await Promise.all(
      unique.map(async (d) => {
        const detailUrl = `${this.apiEndpoint}/${d.id}`;
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

  private async fetchLegislaturaIds(): Promise<number[]> {
    const url = new URL(this.legislaturasEndpoint);
    url.searchParams.set('ordem', 'DESC');
    url.searchParams.set('ordenarPor', 'id');
    url.searchParams.set('itens', String(this.legislaturasToFetch));
    const { data } = await this.httpClient.request(url.toString());
    const response = data as LegislaturaResponse;
    return response.dados.map(l => l.id);
  }
}
