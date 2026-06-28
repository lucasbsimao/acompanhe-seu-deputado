// SPDX-License-Identifier: AGPL-3.0-or-later

import { BasePipeline } from './BasePipeline';
import { DeputiesPipeline } from '../dados-abertos-camara/DeputiesPipeline';
import { SenatorsPipeline } from '../dados-abertos-senado/SenatorsPipeline';
import type { IPipelineDepChain } from '../../types/Pipeline';
import type { EmendaRecord } from '../../repositories/EmendaRepository';
import { EmendaRepository } from '../../repositories/EmendaRepository';
import { PoliticianRepository } from '../../repositories/PoliticianRepository';
import { PoliticianLookupService } from '../../services/PoliticianLookupService';
import type Database from 'better-sqlite3';
import defaultConfig from '../../config/defaults.json';
import { logger } from '../../util/logger';

interface ApiEmenda {
  codigoEmenda: string;
  ano: number;
  tipoEmenda: string | null;
  autor: string;
  nomeAutor: string;
  numeroEmenda: string | null;
  localidadeDoGasto: string | null;
  funcao: string | null;
  subfuncao: string | null;
  valorEmpenhado: string | null;
  valorLiquidado: string | null;
  valorPago: string | null;
  valorRestoInscrito: string | null;
  valorRestoCancelado: string | null;
  valorRestoPago: string | null;
}

export class EmendaParlamentarPipeline extends BasePipeline<ApiEmenda> {
  static readonly dependencies: readonly IPipelineDepChain[] = [DeputiesPipeline, SenatorsPipeline];

  private readonly apiEndpoint = 'https://api.portaldatransparencia.gov.br/api-de-dados/emendas';
  private readonly repo: EmendaRepository;
  private readonly lookupService: PoliticianLookupService;
  private currentYear: number = 0;
  private currentType: string = '';

  constructor(db: Database.Database) {
    super({ pageSize: 100, maxRetries: 3, retryWaitMin: 250, retryWaitMax: 2000 });
    this.repo = new EmendaRepository(db);
    const politicianRepository = new PoliticianRepository(db);
    this.lookupService = new PoliticianLookupService(politicianRepository);
  }

  buildUrl(page: number, pageSize: number): Promise<string> {
    const url = new URL(this.apiEndpoint);
    url.searchParams.set('pagina', String(page));
    url.searchParams.set('tamanhoPagina', String(pageSize));
    url.searchParams.set('ano', String(this.currentYear));
    url.searchParams.set('tipoEmenda', this.currentType);
    return Promise.resolve(url.toString());
  }

  decodePage(data: unknown): Promise<ApiEmenda[]> {
    if (!Array.isArray(data)) {
      throw new Error('Expected an array response from emendas API');
    }
    return Promise.resolve(data as ApiEmenda[]);
  }

  shouldDownload(): Promise<boolean> {
    return Promise.resolve(this.repo.count() === 0);
  }

  onPageFetched(items: ApiEmenda[]): Promise<void> {
    const records: EmendaRecord[] = [];
    let unmatchedCount = 0;

    for (const e of items) {
      const politicianCpf = this.lookupService.findCpfByNormalizedName(e.autor);

      if (!politicianCpf) {
        unmatchedCount++;
        logger.warn({ unmatchedCount }, 'emenda autores not matched to any politician');
        continue;
      }

      records.push({
        codigoEmenda: e.codigoEmenda,
        ano: e.ano,
        tipoEmenda: e.tipoEmenda ?? null,
        politicianCpf: politicianCpf,
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

    this.repo.insertBatch(records);
    return Promise.resolve();
  }

  async execute(forceDownload = false): Promise<void> {
    if (!forceDownload && !(await this.shouldDownload())) {
      logger.info('data already exists, skipping download');
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

        logger.info(
          {
            combinationIndex,
            totalCombinations,
            year: this.currentYear,
            tipoEmenda: this.currentType,
          },
          'processing emenda combination',
        );

        await super.execute(forceDownload);
      }
    }

    logger.info({ totalCombinations, totalYears, totalTypes }, 'emenda pipeline completed');
  }
}
