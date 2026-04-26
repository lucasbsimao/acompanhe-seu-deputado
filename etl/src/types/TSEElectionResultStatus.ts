export enum TSEElectionResultStatus {
  ELEITO_POR_QP = 'ELEITO POR QP',
  ELEITO_POR_MEDIA = 'ELEITO POR MÉDIA',
  SUPLENTE = 'SUPLENTE',
}

export type TSEElectionResultStatusKey = keyof typeof TSEElectionResultStatus;

export namespace TSEElectionResultStatus {
  const VALUE_TO_KEY = Object.fromEntries(
    Object.entries(TSEElectionResultStatus)
      .filter(([, v]) => typeof v === 'string')
      .map(([k, v]) => [v, k])
  ) as Record<string, TSEElectionResultStatusKey>;

  export function fromValue(value: string): TSEElectionResultStatusKey | null {
    return VALUE_TO_KEY[value] ?? null;
  }
}
