// SPDX-License-Identifier: AGPL-3.0-or-later

import { CeapsPortalCategory } from '../types/CeapsPortalCategory';
import { normalizeLabel } from '../util/normalization.util';

/**
 * Maps normalized tipoDespesa labels to CeapsPortalCategory IDs.
 */
export const CEAPS_PORTAL_CATEGORY_MAP: Record<string, CeapsPortalCategory> = {
  'ALUGUEL DE IMOVEIS PARA ESCRITORIO POLITICO': CeapsPortalCategory.ALUGUEL_IMOVEIS_ESCRITORIO,
  'AQUISICAO DE MATERIAL DE CONSUMO': CeapsPortalCategory.MATERIAL_CONSUMO,
  'LOCOMOCAO HOSPEDAGEM ALIMENTACAO E COMBUSTIVEIS':
    CeapsPortalCategory.LOCOMOCAO_HOSPEDAGEM_ALIMENTACAO_COMBUSTIVEIS,
  'CONTRATACAO DE SERVICOS DE APOIO AO PARLAMENTAR': CeapsPortalCategory.SERVICOS_APOIO_PARLAMENTAR,
  'DIVULGACAO DA ATIVIDADE PARLAMENTAR': CeapsPortalCategory.DIVULGACAO_ATIVIDADE_PARLAMENTAR,
  'PASSAGENS AEREAS AQUATICAS E TERRESTRES NACIONAIS': CeapsPortalCategory.PASSAGENS_NACIONAIS,
  'SERVICOS DE SEGURANCA PRIVADA': CeapsPortalCategory.SEGURANCA_PRIVADA,
};

/**
 * Maps a raw tipoDespesa label to its CeapsPortalCategory.
 * Normalizes the label before lookup.
 * Returns null if the label is unmapped.
 */
export function mapToCeapsPortalCategory(label: string): CeapsPortalCategory | null {
  const normalized = normalizeLabel(label);
  const category = CEAPS_PORTAL_CATEGORY_MAP[normalized];

  if (category !== undefined) {
    return category;
  }

  console.warn(
    `[CeapsPortalCategoryMapper] Unmapped tipoDespesa: "${label}" (normalized: "${normalized}")`,
  );
  return null;
}
