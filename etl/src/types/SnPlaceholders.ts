// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Shared list of placeholder serial numbers used in forensic pipelines.
 * These are excluded from duplicate/reuse detection to avoid false positives
 * on blank or generic invoice fields.
 */
export const SN_PLACEHOLDERS: readonly string[] = [
  'S/N',
  'SN',
  'S.N.',
  'S/Nº',
  '00',
  '000',
  '0',
  '-',
  '',
];
