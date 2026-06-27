// SPDX-License-Identifier: AGPL-3.0-or-later

import type { PoliticianRepository } from '../repositories/PoliticianRepository';
import { normalizeNameForMatching } from '../util/normalization.util';
import type { HttpClient } from '../core/HttpClient';
import { PoliticianRole } from '../types/PoliticianRole';
import type {
  SenadorDetailResponse,
  SenadorMandatosResponse,
  MandatoItem,
} from '../types/LegisSenadoApiDto';

export class PoliticianLookupService {
  private readonly compositeToCpfMap: Map<string, string>;
  private readonly politicianRepository: PoliticianRepository;

  constructor(politicianRepository: PoliticianRepository) {
    this.politicianRepository = politicianRepository;
    this.compositeToCpfMap = new Map();
    this.loadPoliticians();
  }

  private loadPoliticians(): void {
    const politicians = this.politicianRepository.getAllForLookup();

    for (const politician of politicians) {
      const key = this.buildKey(politician.name, politician.uf, politician.role);

      if (this.compositeToCpfMap.has(key)) {
        console.warn(`Duplicate composite key found: ${key} (${politician.name})`);
      }

      this.compositeToCpfMap.set(key, politician.cpf);
    }

    console.log(`Loaded ${this.compositeToCpfMap.size} politicians for lookup`);
  }

  private buildKey(name: string, uf: string, role: string): string {
    const normalizedName = normalizeNameForMatching(name);
    const normalizedUf = uf.trim().toUpperCase();
    const normalizedRole = role.trim().toUpperCase();

    return `${normalizedName}-${normalizedUf}-${normalizedRole}`;
  }

  findCpf(name: string, uf: string, role: string): string | null {
    const key = this.buildKey(name, uf, role);
    return this.compositeToCpfMap.get(key) ?? null;
  }

  /**
   * Fallback to use when the full context (name, uf, role) is not available.
   * Use {@link findCpf} instead when possible.
   */
  findCpfByNormalizedName(autorName: string | null): string | null {
    if (!autorName) {
      return null;
    }

    const normalizedAutor = normalizeNameForMatching(autorName);
    const matches: string[] = [];

    // Fallback search: find any match with this name.
    for (const [key, cpf] of this.compositeToCpfMap.entries()) {
      if (key.startsWith(`${normalizedAutor}-`)) {
        matches.push(cpf);
      }
    }

    if (matches.length > 1) {
      console.warn(
        `Ambiguous lookup for name "${autorName}": ${matches.length} matches found. Use findCpf with full context instead.`,
      );
      return null; // Don't return an arbitrary one if ambiguous
    }

    return matches[0] ?? null;
  }

  private async fetchSenatorRepresentationUf(
    code: string,
    httpClient: HttpClient,
  ): Promise<string | null> {
    const url = `https://legis.senado.leg.br/dadosabertos/senador/${code}/mandatos`;
    const response = await httpClient.request(url, {
      headers: { Accept: 'application/json' },
    });
    const data = response.data as SenadorMandatosResponse;
    const mandatoRaw = data?.MandatoParlamentar?.Parlamentar?.Mandatos?.Mandato;

    if (!mandatoRaw) {
      return null;
    }

    const mandates: MandatoItem[] = Array.isArray(mandatoRaw) ? mandatoRaw : [mandatoRaw];
    mandates.sort((a, b) => Number(b.CodigoMandato) - Number(a.CodigoMandato));
    return mandates[0]?.UfParlamentar ?? null;
  }

  async findCpfBySenatorCode(
    code: string,
    httpClient: HttpClient,
  ): Promise<{ cpf: string; name: string; uf: string } | null> {
    const url = `https://legis.senado.leg.br/dadosabertos/senador/${code}`;
    try {
      const detailResponse = await httpClient.request(url, {
        headers: { Accept: 'application/json' },
      });
      const data = detailResponse.data as SenadorDetailResponse;
      const identification = data?.DetalheParlamentar?.Parlamentar?.IdentificacaoParlamentar;

      if (!identification) {
        return null;
      }

      const completeName = identification.NomeCompletoParlamentar;
      const shortName = identification.NomeParlamentar;
      const name = completeName || shortName;

      if (!name) {
        return null;
      }

      const uf = await this.fetchSenatorRepresentationUf(code, httpClient);

      if (!uf) {
        return null;
      }

      const cpf = this.findCpf(name, uf, PoliticianRole.SENATOR);
      if (cpf) {
        return { cpf, name, uf };
      }

      // Try with NomeParlamentar as well if different
      if (shortName && shortName !== completeName) {
        const cpfAlt = this.findCpf(shortName, uf, PoliticianRole.SENATOR);
        if (cpfAlt) {
          return { cpf: cpfAlt, name: shortName, uf };
        }
      }

      return null;
    } catch (error) {
      console.warn(`Failed to lookup senator code ${code} via API:`, error);
      return null;
    }
  }
}
