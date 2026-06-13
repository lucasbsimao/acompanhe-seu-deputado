// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Numeric codes returned by the Câmara dos Deputados open-data API
 * (`GET /api/v2/deputados/{id}/despesas`) in the `codTipoDocumento` field.
 *
 * The API does not expose a reference endpoint for these codes, so they were
 * derived empirically by cross-referencing `codTipoDocumento` values with their
 * paired `tipoDocumento` string labels across multiple deputies and years.
 *
 * @see https://dadosabertos.camara.leg.br/api/v2/deputados/{id}/despesas
 */
export enum CodTipoDocumento {
  /**
   * Nota Fiscal — paper fiscal invoice issued by a Brazilian vendor.
   */
  NOTA_FISCAL = 0,

  /**
   * Recibos/Outros — generic receipts and any document type not covered by
   * the other codes (e.g. handwritten receipts, informal proofs of payment).
   */
  RECIBOS_OUTROS = 1,

  /**
   * Despesa no Exterior — expense incurred outside Brazil, documented with a
   * foreign receipt or invoice. Vendors are typically domestic carriers (LATAM,
   * GOL) or international ride-hailing services (Uber).
   */
  DESPESA_NO_EXTERIOR = 2,

  /**
   * Despesa do PARLASUL — expense related to the deputy's participation in the
   * Mercosul Parliament (Parlamento do MERCOSUL). Vendors are almost exclusively
   * located in Montevideo, Uruguay, where PARLASUL sessions are held.
   *
   * @see https://www.parlamentomercosul.org
   */
  DESPESA_DO_PARLASUL = 3,

  /**
   * Nota Fiscal Eletrônica — electronic fiscal invoice (NF-e), the most common
   * document type. Replaces the paper Nota Fiscal for most transactions since
   * Brazil's NF-e mandate.
   */
  NOTA_FISCAL_ELETRONICA = 4,

  // CEAPS-only codes (Senate, string-based labels)
  CUPOM_FISCAL = 10, // CEAPS "Cupom Fiscal"
  FATURA = 11, // CEAPS "Fatura"
  BOLETO = 12, // CEAPS "Boleto"
  PASSAGEM = 13, // CEAPS "Passagem / Bilhete / Código Localizador"
  //TODO: Why is RECIBO distinct from RECIBOS_OUTROS?
  RECIBO = 14, // CEAPS "Recibo" (distinct from RECIBOS_OUTROS catch-all)
  OTHER = 99, // Unmapped CEAPS string — emits console.warn
}

export const CEAPS_DOCUMENT_TYPE_MAP: Record<string, CodTipoDocumento> = {
  'Nota Fiscal': CodTipoDocumento.NOTA_FISCAL,
  'Nota Fiscal Eletrônica': CodTipoDocumento.NOTA_FISCAL_ELETRONICA,
  'Cupom Fiscal': CodTipoDocumento.CUPOM_FISCAL,
  Fatura: CodTipoDocumento.FATURA,
  Boleto: CodTipoDocumento.BOLETO,
  'Passagem / Bilhete / Código Localizador': CodTipoDocumento.PASSAGEM,
  Recibo: CodTipoDocumento.RECIBO,
};

/**
 * TODO: This function should reside inside a types module?
 * Maps CEAPS document type labels to their numeric codes.
 * Returns CodTipoDocumento.OTHER and warns if the label is unmapped.
 */
export function mapCeapsDocumentType(label: string): CodTipoDocumento {
  const code = CEAPS_DOCUMENT_TYPE_MAP[label];
  if (code !== undefined) {
    return code;
  }

  console.warn(`Unmapped CEAPS document type: "${label}"`);
  return CodTipoDocumento.OTHER;
}
