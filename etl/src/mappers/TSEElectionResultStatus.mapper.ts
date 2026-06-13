// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  TSEElectionResultStatus,
  type TSEElectionResultStatusKey,
} from '../types/TSEElectionResultStatus';

const TSE_VALUE_TO_KEY = Object.fromEntries(
  Object.entries(TSEElectionResultStatus)
    .filter(([, v]) => typeof v === 'string')
    .map(([k, v]) => [v, k]),
) as Record<string, TSEElectionResultStatusKey>;

/**
 * Maps TSE election result status labels (string) to their enum keys.
 */
export function tseElectionResultStatusFromValue(value: string): TSEElectionResultStatusKey | null {
  return TSE_VALUE_TO_KEY[value] ?? null;
}
