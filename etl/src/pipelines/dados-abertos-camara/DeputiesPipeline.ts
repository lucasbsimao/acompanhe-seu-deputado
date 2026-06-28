// SPDX-License-Identifier: AGPL-3.0-or-later

import { BasePipeline } from './BasePipeline';
import { PoliticianRepository } from '../../repositories/PoliticianRepository';
import type Database from 'better-sqlite3';
import { logger } from '../../util/logger';
import { normalizeId } from '../../util/normalization.util';
import { normalizeCPF, isValidCPF } from '../../util/cpf.util';
import { PoliticianRole } from '../../types/PoliticianRole';
import defaultConfig from '../../config/defaults.json';
import { TSE2022ElectionResultsPipeline } from '../tse-dados-abertos/TSE2022ElectionResultsPipeline';
import type { IPipelineDepChain } from '../../types/Pipeline';
import { PartiesPipeline } from './PartiesPipeline';

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
  static readonly dependencies: readonly IPipelineDepChain[] = [
    TSE2022ElectionResultsPipeline,
    PartiesPipeline,
  ];

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
      logger.info('data already exists, skipping download');
      return;
    }

    const legislaturaIds = await this.fetchLegislaturaIds();
    for (const id of legislaturaIds) {
      this.currentLegislaturaId = id;
      logger.info({ legislaturaId: id }, 'fetching deputies for legislature');
      await super.execute(true);
    }
  }

  buildUrl(page: number, pageSize: number): Promise<string> {
    const url = new URL(this.apiEndpoint);
    url.searchParams.set('ordem', 'ASC');
    url.searchParams.set('ordenarPor', 'id');
    url.searchParams.set('pagina', String(page));
    url.searchParams.set('itens', String(pageSize));
    if (this.currentLegislaturaId !== null) {
      // Plain /deputados only returns currently active deputies; filtering by idLegislatura
      // includes everyone who ever held a seat in that term (ministers on leave, resignees, suplentes).
      url.searchParams.set('idLegislatura', String(this.currentLegislaturaId));
    }
    return Promise.resolve(url.toString());
  }

  decodePage(data: unknown): Promise<PoliticianData[]> {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid response data');
    }

    const response = data as ApiResponse;
    if (!Array.isArray(response.dados)) {
      throw new Error('Response does not contain dados array');
    }

    return Promise.resolve(response.dados);
  }

  extractTotalCount(headers: Record<string, string>): Promise<number> {
    const totalCountHeader = headers['x-total-count'];
    if (!totalCountHeader) {
      throw new Error('Missing X-Total-Count header');
    }

    const totalCount = parseInt(totalCountHeader, 10);
    if (isNaN(totalCount)) {
      throw new Error('Invalid X-Total-Count header value');
    }

    return Promise.resolve(totalCount);
  }

  shouldDownload(): Promise<boolean> {
    return Promise.resolve(this.repo.countByRoleWithSourceApiId(PoliticianRole.DEPUTY) === 0);
  }

  async onPageFetched(items: PoliticianData[]): Promise<void> {
    const unique = Array.from(new Map(items.map(d => [d.id, d])).values());
    const detailedDeputies = await Promise.all(
      unique.map(async d => {
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
      }),
    );

    this.repo.updateBatch(detailedDeputies.filter(d => isValidCPF(d.cpf)));
  }

  // Deputy IDs are non-consecutive; gaps return 404. Enumerating by legislature is the only reliable approach.
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
