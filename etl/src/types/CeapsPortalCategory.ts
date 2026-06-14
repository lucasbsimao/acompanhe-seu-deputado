// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * CEAPS expenditure categories on the Senate transparency portal (www6g.senado.leg.br).
 * The numeric values match the portal's category IDs.
 */
export enum CeapsPortalCategory {
  /** Real estate rental for political offices */
  ALUGUEL_IMOVEIS_ESCRITORIO = 1,
  /** Acquisition of consumable materials */
  MATERIAL_CONSUMO = 2,
  /** Transportation, lodging, meals, and fuel */
  LOCOMOCAO_HOSPEDAGEM_ALIMENTACAO_COMBUSTIVEIS = 3,
  /** Hiring of support services for the parliamentarian */
  SERVICOS_APOIO_PARLAMENTAR = 4,
  /** Publicity of parliamentary activity */
  DIVULGACAO_ATIVIDADE_PARLAMENTAR = 5,
  /** National air, water, and land travel tickets */
  PASSAGENS_NACIONAIS = 8,
  /** Private security services */
  SEGURANCA_PRIVADA = 9,
}
