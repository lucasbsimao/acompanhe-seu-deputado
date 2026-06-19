// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * TSE candidate office (cargo) codes as they appear in the DS_CARGO field of
 * TSE open-data CSV files (consulta_cand_*.zip).
 *
 * @see https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/
 */
export enum TSECargo {
  /** Federal deputy — member of the Chamber of Deputies (majority-proportional). */
  DEPUTADO_FEDERAL = 'DEPUTADO FEDERAL',

  /** Senator — main candidate on a senate slate (majority election). */
  SENADOR = 'SENADOR',

  /**
   * First senate alternate. Starting with the 2022 election cycle the TSE
   * assigns alternates their own DS_CARGO value rather than reusing 'SENADOR'
   * with a different DS_SIT_TOT_TURNO. A winning first alternate has
   * DS_SIT_TOT_TURNO='SUPLENTE' and must be stored as a senator.
   */
  SUPLENTE_1 = '1º SUPLENTE',

  /**
   * Second senate alternate. Same format change as {@link SUPLENTE_1}.
   * A winning second alternate has DS_SIT_TOT_TURNO='SUPLENTE' and must be
   * stored as a senator.
   */
  SUPLENTE_2 = '2º SUPLENTE',
}
