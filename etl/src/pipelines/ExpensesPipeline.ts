import { BasePipeline } from '../core/BasePipeline';
import { ExpensesRepository } from '../repositories/ExpensesRepository';
import type Database from 'better-sqlite3';
import { normalizeNumericText } from '../util/normalization.util';
import { convertToCents } from '../util/convertion.util';

interface ExpenseData {
  ano: number;
  mes: number;
  tipoDespesa: string;
  codDocumento: string;
  tipoDocumento: string;
  codTipoDocumento: number;
  dataDocumento: string;
  numDocumento: string;
  valorDocumento: number;
  urlDocumento: string;
  nomeFornecedor: string;
  cnpjCpfFornecedor: string;
  valorLiquido: number;
  valorGlosa: number;
  numRessarcimento: string;
  codLote: number;
  parcela: number;
}

interface ApiResponse {
  dados: ExpenseData[];
}

export class ExpensesPipeline extends BasePipeline<ExpenseData> {
  private readonly apiEndpoint = 'https://dadosabertos.camara.leg.br/api/v2/deputados';
  private readonly repo: ExpensesRepository;
  private readonly db: Database.Database;
  private currentDeputyId: string = '';

  constructor(db: Database.Database) {
    super({
      pageSize: 100,
      parallelism: 5,
      maxRetries: 3,
      retryWaitMin: 250,
      retryWaitMax: 2000,
    });
    this.repo = new ExpensesRepository(db);
    this.db = db;
  }

  async buildUrl(page: number, pageSize: number): Promise<string> {
    const url = new URL(`${this.apiEndpoint}/${this.currentDeputyId}/despesas`);
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 4 }, (_, i) => currentYear - i).join(',');
    
    url.searchParams.set('ordem', 'ASC');
    url.searchParams.set('ano', years);
    url.searchParams.set('ordenarPor', 'ano');
    url.searchParams.set('pagina', String(page));
    url.searchParams.set('itens', String(pageSize));
    return url.toString();
  }

  async decodePage(data: unknown): Promise<ExpenseData[]> {
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
    return !this.repo.hasExpensesForDeputy(this.currentDeputyId);
  }

  async onPageFetched(items: ExpenseData[]): Promise<void> {
    this.repo.insertBatch(
      items.map(e => ({
        id: `${this.currentDeputyId}_${e.codDocumento}`,
        deputyId: this.currentDeputyId,
        tipoDespesa: normalizeNumericText(e.tipoDespesa),
        codDocumento: e.codDocumento,
        codTipoDocumento: e.codTipoDocumento,
        dataDocumento: e.dataDocumento,
        numDocumento: e.numDocumento,
        urlDocumento: e.urlDocumento || null,
        nomeFornecedor: e.nomeFornecedor,
        cnpjCpfFornecedor: normalizeNumericText(e.cnpjCpfFornecedor),
        valorLiquido: convertToCents(e.valorLiquido),
        valorGlosa: convertToCents(e.valorGlosa),
      }))
    );
  }

  async execute(forceDownload = false): Promise<void> {
    const allDeputyIds = this.db
      .prepare("SELECT id FROM politicians WHERE role = 'DEPUTY'")
      .all()
      .map((row: any) => row.id);
    console.log(`Found ${allDeputyIds.length} deputies to process`);

    for (let deputyIndex = 0; deputyIndex < allDeputyIds.length; deputyIndex++) {
      this.currentDeputyId = allDeputyIds[deputyIndex];
      
      console.log(`\nProcessing deputy ${deputyIndex + 1}/${allDeputyIds.length}: ${this.currentDeputyId}`);

      await super.execute(forceDownload);
    }

    console.log('\nAll deputies processed successfully');
  }
}
