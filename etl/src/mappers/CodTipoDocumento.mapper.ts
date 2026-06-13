// SPDX-License-Identifier: AGPL-3.0-or-later

import { CodTipoDocumento } from '../types/CodTipoDocumento';

/**
 * Maps CEAPS (Senate) document type labels to their numeric codes.
 */
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
