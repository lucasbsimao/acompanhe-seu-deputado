// SPDX-License-Identifier: AGPL-3.0-or-later

import { CeapsPortalCategory } from '../types/CeapsPortalCategory';
import { normalizeLabel } from '../util/normalization.util';
import { logger } from '../util/logger';

/**
 * Maps normalized tipoDespesa labels to CeapsPortalCategory IDs.
 */
export const CEAPS_PORTAL_CATEGORY_MAP: Record<string, CeapsPortalCategory> = {
  // Full tipoDespesa strings as they appear in the dados-abertos-senado CSV (uppercased, accent-stripped).
  // Category IDs verified against https://www6g.senado.leg.br/transparencia/sen/<cod>/ceaps/<id>/detalhe/
  'ALUGUEL DE IMOVEIS PARA ESCRITORIO POLITICO COMPREENDENDO DESPESAS CONCERNENTES A ELES':
    CeapsPortalCategory.ALUGUEL_IMOVEIS_ESCRITORIO,
  'AQUISICAO DE MATERIAL DE CONSUMO PARA USO NO ESCRITORIO POLITICO INCLUSIVE AQUISICAO OU LOCACAO DE SOFTWARE DESPESAS POSTAIS AQUISICAO DE PUBLICACOES LOCACAO DE MOVEIS E DE EQUIPAMENTOS':
    CeapsPortalCategory.MATERIAL_CONSUMO,
  'LOCOMOCAO HOSPEDAGEM ALIMENTACAO COMBUSTIVEIS E LUBRIFICANTES':
    CeapsPortalCategory.LOCOMOCAO_HOSPEDAGEM_ALIMENTACAO_COMBUSTIVEIS,
  'CONTRATACAO DE CONSULTORIAS ASSESSORIAS PESQUISAS TRABALHOS TECNICOS E OUTROS SERVICOS DE APOIO AO EXERCICIO DO MANDATO PARLAMENTAR':
    CeapsPortalCategory.SERVICOS_APOIO_PARLAMENTAR,
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

  logger.warn({ tipoDespesa: label, normalized }, 'unmapped tipoDespesa');
  return null;
}
