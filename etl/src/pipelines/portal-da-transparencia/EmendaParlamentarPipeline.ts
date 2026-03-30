import { BasePipeline } from './BasePipeline';
import { EmendaRepository, EmendaRecord } from '../../repositories/EmendaRepository';
import { PoliticianLookupService } from '../../services/PoliticianLookupService';
import type Database from 'better-sqlite3';
import defaultConfig from '../../config/defaults.json';

interface ApiEmenda {
  codigoEmenda: string;
  ano: number;
  tipoEmenda: string;
  autor: string;
  nomeAutor: string;
  numeroEmenda: string;
  localidadeDoGasto: string;
  funcao: string;
  subfuncao: string;
  valorEmpenhado: string;
  valorLiquidado: string;
  valorPago: string;
  valorRestoInscrito: string;
  valorRestoCancelado: string;
  valorRestoPago: string;
}

export class EmendaParlamentarPipeline extends BasePipeline<ApiEmenda> {
  private readonly apiEndpoint = 'https://api.portaldatransparencia.gov.br/api-de-dados/emendas';
  private readonly repo: EmendaRepository;
  private readonly lookupService: PoliticianLookupService;
  private currentYear: number = 0;
  private currentType: string = '';

  constructor(db: Database.Database) {
    super({ pageSize: 100, maxRetries: 3, retryWaitMin: 250, retryWaitMax: 2000 });
    this.repo = new EmendaRepository(db);
    this.lookupService = new PoliticianLookupService(db);
  }

  async buildUrl(page: number, pageSize: number): Promise<string> {
    const url = new URL(this.apiEndpoint);
    url.searchParams.set('pagina', String(page));
    url.searchParams.set('tamanhoPagina', String(pageSize));
    url.searchParams.set('ano', String(this.currentYear));
    url.searchParams.set('tipoEmenda', this.currentType);
    return url.toString();
  }

  async decodePage(data: unknown): Promise<ApiEmenda[]> {
    if (!Array.isArray(data)) {
      throw new Error('Expected an array response from emendas API');
    }
    return data as ApiEmenda[];
  }

  async shouldDownload(): Promise<boolean> {
    return this.repo.count() === 0;
  }

  async onPageFetched(items: ApiEmenda[]): Promise<void> {
    const records: EmendaRecord[] = [];
    let unmatchedCount = 0;

    for (const e of items) {
      const politicianId = this.lookupService.findByNormalizedName(e.autor);
      
      if (e.autor && !politicianId) {
        unmatchedCount++;
        if (unmatchedCount <= 5) {
          console.warn(`Could not match autor: ${e.autor}`);
        }
      }

      records.push({
        codigoEmenda: e.codigoEmenda,
        ano: e.ano,
        tipoEmenda: e.tipoEmenda ?? null,
        politicianId: politicianId,
        numeroEmenda: e.numeroEmenda ?? null,
        localidadeDoGasto: e.localidadeDoGasto ?? null,
        funcao: e.funcao ?? null,
        subfuncao: e.subfuncao ?? null,
        valorEmpenhado: e.valorEmpenhado ?? null,
        valorLiquidado: e.valorLiquidado ?? null,
        valorPago: e.valorPago ?? null,
        valorRestoInscrito: e.valorRestoInscrito ?? null,
        valorRestoCancelado: e.valorRestoCancelado ?? null,
        valorRestoPago: e.valorRestoPago ?? null,
      });
    }

    if (unmatchedCount > 5) {
      console.warn(`... and ${unmatchedCount - 5} more unmatched authors`);
    }

    this.repo.insertBatch(records);
  }

  async execute(forceDownload = false): Promise<void> {
    if (!forceDownload && !(await this.shouldDownload())) {
      console.log('Data already exists, skipping download. Use --force-download to override.');
      return;
    }

    const baseYear = new Date().getFullYear();
    const yearsToFetch = defaultConfig.amendments.yearsToFetch;
    const years = Array.from({ length: yearsToFetch }, (_, i) => baseYear - i);
    const types = defaultConfig.amendments.types;
    const totalYears = years.length;
    const totalTypes = types.length;
    const totalCombinations = totalYears * totalTypes;
    let combinationIndex = 0;

    for (let yearIndex = 0; yearIndex < years.length; yearIndex++) {
      this.currentYear = years[yearIndex];

      for (let tipoIndex = 0; tipoIndex < types.length; tipoIndex++) {
        this.currentType = types[tipoIndex];
        combinationIndex++;

        process.stdout.write('\x1B[2J\x1B[H');
        process.stdout.write(`Processing ${combinationIndex}/${totalCombinations}: Year ${this.currentYear}, Type: ${this.currentType}\n`);

        await super.execute(forceDownload);
      }
    }

    process.stdout.write('\x1B[2J\x1B[H');
    console.log(`All ${totalCombinations} combinations (${totalYears} years × ${totalTypes} types) processed successfully`);
  }
}
