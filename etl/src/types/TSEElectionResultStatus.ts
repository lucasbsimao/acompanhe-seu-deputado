// SPDX-License-Identifier: AGPL-3.0-or-later

export enum TSEElectionResultStatus {
  ELEITO = 'ELEITO',
  ELEITO_POR_QP = 'ELEITO POR QP',
  ELEITO_POR_MEDIA = 'ELEITO POR MÉDIA',
  SUPLENTE = 'SUPLENTE',
}

export type TSEElectionResultStatusKey = keyof typeof TSEElectionResultStatus;
