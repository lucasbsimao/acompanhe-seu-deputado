import { BasePipeline } from './BasePipeline';
import { EmendaRepository, EmendaRecord } from '../../repositories/EmendaRepository';
import type Database from 'better-sqlite3';

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

  constructor(db: Database.Database) {
    super({ pageSize: 100, maxRetries: 3, retryWaitMin: 250, retryWaitMax: 2000 });
    this.repo = new EmendaRepository(db);
  }

  async buildUrl(page: number, pageSize: number): Promise<string> {
    const url = new URL(this.apiEndpoint);
    url.searchParams.set('pagina', String(page));
    url.searchParams.set('tamanhoPagina', String(pageSize));
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
    this.repo.insertBatch(
      items.map((e): EmendaRecord => ({
        codigoEmenda: e.codigoEmenda,
        ano: e.ano,
        tipoEmenda: e.tipoEmenda ?? null,
        autor: e.autor ?? null,
        nomeAutor: e.nomeAutor ?? null,
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
      }))
    );
  }
}
