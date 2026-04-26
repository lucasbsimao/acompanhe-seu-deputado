import { BasePipeline } from './BasePipeline';
import { PoliticianRepository } from '../../repositories/PoliticianRepository';
import type Database from 'better-sqlite3';
import { normalizeId } from '../../util/normalization.util';
import { normalizeCPF, isValidCPF } from '../../util/cpf.util';
import { PoliticianRole } from '../../types/PoliticianRole';

interface SenatorIdentification {
  CodigoParlamentar: string;
  NomeParlamentar: string;
  SiglaPartidoParlamentar: string;
  UfParlamentar: string;
  UrlFotoParlamentar?: string;
}

interface SenatorData {
  IdentificacaoParlamentar: SenatorIdentification;
}

interface SenatorDetail {
  DetalheParlamentar: {
    Parlamentar: {
      IdentificacaoParlamentar: {
        CodigoParlamentar: string;
        NomeParlamentar: string;
        SiglaPartidoParlamentar: string;
        UfParlamentar: string;
        UrlFotoParlamentar?: string;
      };
      DadosBasicosParlamentar: {
        Cpf: string;
      };
    };
  };
}

interface SenatorsResponse {
  ListaParlamentarEmExercicio: {
    Parlamentares: {
      Parlamentar: SenatorData | SenatorData[];
    };
  };
}

export class SenatorsPipeline extends BasePipeline<SenatorData> {
  private readonly apiEndpoint = 'https://legis.senado.leg.br/dadosabertos/senador/lista/atual?participacao=T&v=4';
  private readonly repo: PoliticianRepository;

  constructor(db: Database.Database) {
    super({
      maxRetries: 3,
      retryWaitMin: 250,
      retryWaitMax: 2000,
    });
    this.repo = new PoliticianRepository(db);
  }

  async buildUrl(): Promise<string> {
    return this.apiEndpoint;
  }

  async decodePage(data: unknown): Promise<SenatorData[]> {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid response data');
    }

    const response = data as SenatorsResponse;
    
    if (!response.ListaParlamentarEmExercicio?.Parlamentares?.Parlamentar) {
      throw new Error('Response does not contain Parlamentar data');
    }

    const parlamentar = response.ListaParlamentarEmExercicio.Parlamentares.Parlamentar;
    const senators = Array.isArray(parlamentar) ? parlamentar : [parlamentar];
    
    return senators;
  }

  async shouldDownload(): Promise<boolean> {
    return this.repo.countByRole(PoliticianRole.SENATOR) === 0;
  }

  async onPageFetched(items: SenatorData[]): Promise<void> {
    const detailedSenators = await Promise.all(
      items.map(async (s) => {
        const codigo = s.IdentificacaoParlamentar.CodigoParlamentar;
        const detailUrl = `https://legis.senado.leg.br/dadosabertos/senador/${codigo}`;
        const { data } = await this.httpClient.request(detailUrl);
        const detail = data as SenatorDetail;
        const cpf = detail.DetalheParlamentar.Parlamentar.DadosBasicosParlamentar.Cpf;
        
        return {
          cpf: normalizeCPF(cpf),
          sourceApiId: codigo,
          name: s.IdentificacaoParlamentar.NomeParlamentar,
          uf: s.IdentificacaoParlamentar.UfParlamentar,
          partyId: normalizeId(s.IdentificacaoParlamentar.SiglaPartidoParlamentar),
          role: PoliticianRole.SENATOR,
          photoUrl: s.IdentificacaoParlamentar.UrlFotoParlamentar || null,
        };
      })
    );
    
    this.repo.insertBatch(detailedSenators.filter(s => isValidCPF(s.cpf)));
  }
}
