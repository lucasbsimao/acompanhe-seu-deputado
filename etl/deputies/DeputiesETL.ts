import { PaginationEngine } from '../core/PaginationEngine';

interface PoliticianData {
  id: number;
  nome: string;
  siglaPartido: string;
  siglaUf: string;
  urlFoto: string;
}

interface ApiResponse {
  dados: PoliticianData[];
}

export class DeputiesETL extends PaginationEngine<PoliticianData> {
  private readonly apiEndpoint = 'https://dadosabertos.camara.leg.br/api/v2/deputados';

  constructor() {
    super({
      pageSize: 100,
      workers: 5,
      maxRetries: 3,
      retryWaitMin: 250,
      retryWaitMax: 2000,
      fileName: 'deputies.json',
    });
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
}
