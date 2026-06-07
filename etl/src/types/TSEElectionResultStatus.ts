export enum TSEElectionResultStatus {
  ELEITO = 'ELEITO',
  ELEITO_POR_QP = 'ELEITO POR QP',
  ELEITO_POR_MEDIA = 'ELEITO POR MÉDIA',
  SUPLENTE = 'SUPLENTE',
}

export type TSEElectionResultStatusKey = keyof typeof TSEElectionResultStatus;

const TSE_VALUE_TO_KEY = Object.fromEntries(
  Object.entries(TSEElectionResultStatus)
    .filter(([, v]) => typeof v === 'string')
    .map(([k, v]) => [v, k]),
) as Record<string, TSEElectionResultStatusKey>;

export function tseElectionResultStatusFromValue(value: string): TSEElectionResultStatusKey | null {
  return TSE_VALUE_TO_KEY[value] ?? null;
}
