import { BasePipeline } from '../core/BasePipeline';
import { ExpensesRepository } from '../repositories/ExpensesRepository';
import type Database from 'better-sqlite3';
import prompts from 'prompts';
import { normalizeNumericText } from '../util/normalization.util';
import { dateToTimestamp, convertToCents } from '../util/convertion.util';

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
  private readonly targetDeputyId?: string;
  private currentDeputyId: string = '';
  private allDeputyIds: string[] = [];
  private deputyIndex: number = 0;

  constructor(db: Database.Database, deputyId?: string) {
    super({
      pageSize: 100,
      parallelism: 5,
      maxRetries: 3,
      retryWaitMin: 250,
      retryWaitMax: 2000,
    });
    this.repo = new ExpensesRepository(db);
    this.db = db;
    this.targetDeputyId = deputyId;
  }

  async buildUrl(page: number, pageSize: number): Promise<string> {
    const url = new URL(`${this.apiEndpoint}/${this.currentDeputyId}/despesas`);
    url.searchParams.set('ordem', 'ASC');
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

  async promptForOptions(isAutomated: boolean): Promise<void> {
    if (isAutomated) {
      return;
    }

    const response = await prompts({
      type: 'select',
      name: 'mode',
      message: 'Download expenses for:',
      choices: [
        { title: 'All deputies', value: 'all' },
        { title: 'Specific deputy ID', value: 'specific' },
      ],
    });

    if (!response.mode) {
      console.log('No option selected');
      process.exit(0);
    }

    if (response.mode === 'specific') {
      const deputyResponse = await prompts({
        type: 'text',
        name: 'deputyId',
        message: 'Enter deputy ID:',
        validate: (value) => (value.trim() ? true : 'Deputy ID is required'),
      });

      if (!deputyResponse.deputyId) {
        console.log('No deputy ID provided');
        process.exit(0);
      }

      (this as any).targetDeputyId = deputyResponse.deputyId.trim();
    }
  }

  protected async onPageFetched(items: ExpenseData[]): Promise<void> {
    this.repo.insertBatch(
      items.map(e => ({
        id: `${this.currentDeputyId}_${e.codDocumento}`,
        deputyId: this.currentDeputyId,
        tipoDespesa: normalizeNumericText(e.tipoDespesa),
        codDocumento: e.codDocumento,
        codTipoDocumento: e.codTipoDocumento,
        dataDocumento: dateToTimestamp(e.dataDocumento),
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
    if (this.targetDeputyId) {
      this.allDeputyIds = [this.targetDeputyId];
      console.log(`Processing single deputy: ${this.targetDeputyId}`);
    } else {
      this.allDeputyIds = this.db
        .prepare("SELECT id FROM politicians WHERE role = 'DEPUTY'")
        .all()
        .map((row: any) => row.id);
      console.log(`Found ${this.allDeputyIds.length} deputies to process`);
    }

    for (this.deputyIndex = 0; this.deputyIndex < this.allDeputyIds.length; this.deputyIndex++) {
      this.currentDeputyId = this.allDeputyIds[this.deputyIndex];
      
      if (!this.targetDeputyId) {
        console.log(`\nProcessing deputy ${this.deputyIndex + 1}/${this.allDeputyIds.length}: ${this.currentDeputyId}`);
      }

      await super.execute(forceDownload);
    }

    if (this.targetDeputyId) {
      console.log(`\nDeputy ${this.targetDeputyId} processed successfully`);
    } else {
      console.log('\nAll deputies processed successfully');
    }
  }
}
