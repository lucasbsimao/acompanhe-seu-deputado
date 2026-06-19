// SPDX-License-Identifier: AGPL-3.0-or-later

import { BasePipeline } from './BasePipeline';
import { TSE2018SenatorsPipeline } from '../tse-dados-abertos/TSE2018SenatorsPipeline';
import type { IPipelineDepChain } from '../../types/Pipeline';
import { PoliticianRepository } from '../../repositories/PoliticianRepository';
import { PoliticianLookupService } from '../../services/PoliticianLookupService';
import type Database from 'better-sqlite3';
import { normalizeId } from '../../util/normalization.util';
import { PoliticianRole } from '../../types/PoliticianRole';
import { TSE2022ElectionResultsPipeline } from '../tse-dados-abertos/TSE2022ElectionResultsPipeline';

interface SenatorIdentification {
  CodigoParlamentar: string;
  NomeParlamentar: string;
  NomeCompletoParlamentar?: string;
  SiglaPartidoParlamentar: string;
  UfParlamentar: string;
  UrlFotoParlamentar?: string;
}

interface SenatorData {
  IdentificacaoParlamentar: SenatorIdentification;
}

interface SenatorsResponse {
  ListaParlamentarEmExercicio?: {
    Parlamentares?: {
      Parlamentar?: SenatorData | SenatorData[];
    };
  };
}

/**
 * Senators Pipeline
 *
 * Collects active senators from the Senado Open Data API and enriches their
 * profiles with additional details like photos and internal parliamentary IDs.
 *
 * Source: Senado Open Data API (lista/atual).
 *
 * Key behaviour: Leverages {@link PoliticianLookupService} to match API names
 * with CPFs already stored in the database from TSE pipelines. Updates
 * records with metadata provided by the Senado.
 *
 * Co-dependencies: Depends on {@link TSE2018SenatorsPipeline} to ensure the
 * 2018 and 2022 senator cohorts are seeded before matching begins.
 */
export class SenatorsPipeline extends BasePipeline<SenatorData> {
  static readonly dependencies: readonly IPipelineDepChain[] = [
    TSE2018SenatorsPipeline,
    TSE2022ElectionResultsPipeline,
  ];

  private readonly apiEndpoint =
    'https://legis.senado.leg.br/dadosabertos/senador/lista/atual?participacao=T&v=4';
  private readonly repo: PoliticianRepository;
  private readonly lookupService: PoliticianLookupService;

  constructor(db: Database.Database) {
    super({
      maxRetries: 3,
      retryWaitMin: 250,
      retryWaitMax: 2000,
    });
    this.repo = new PoliticianRepository(db);
    this.lookupService = new PoliticianLookupService(this.repo);
  }

  buildUrl(): Promise<string> {
    return Promise.resolve(this.apiEndpoint);
  }

  decodePage(data: unknown): Promise<SenatorData[]> {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid response data');
    }

    const response = data as SenatorsResponse;

    if (!response.ListaParlamentarEmExercicio?.Parlamentares?.Parlamentar) {
      throw new Error('Response does not contain Parlamentar data');
    }

    const parlamentar = response.ListaParlamentarEmExercicio.Parlamentares.Parlamentar;
    const senators = Array.isArray(parlamentar) ? parlamentar : [parlamentar];

    return Promise.resolve(senators);
  }

  shouldDownload(): Promise<boolean> {
    return Promise.resolve(true);
    //return Promise.resolve(this.repo.countByRoleWithSourceApiId(PoliticianRole.SENATOR) === 0);
  }

  onPageFetched(items: SenatorData[]): Promise<void> {
    const matchedSenators = items
      .map(s => {
        const id = s.IdentificacaoParlamentar;
        let cpf = this.lookupService.findCpf(
          id.NomeParlamentar,
          id.UfParlamentar,
          PoliticianRole.SENATOR,
        );

        if (!cpf && id.NomeCompletoParlamentar) {
          cpf = this.lookupService.findCpf(
            id.NomeCompletoParlamentar,
            id.UfParlamentar,
            PoliticianRole.SENATOR,
          );
        }

        if (!cpf) {
          console.warn(
            `Could not match senator: ${id.NomeParlamentar} (${id.NomeCompletoParlamentar})`,
          );
          return null;
        }

        return {
          cpf,
          sourceApiId: id.CodigoParlamentar,
          name: id.NomeParlamentar,
          uf: id.UfParlamentar,
          partyId: normalizeId(id.SiglaPartidoParlamentar),
          role: PoliticianRole.SENATOR,
          photoUrl: id.UrlFotoParlamentar ?? null,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    this.repo.updateBatch(matchedSenators);
    return Promise.resolve();
  }
}
