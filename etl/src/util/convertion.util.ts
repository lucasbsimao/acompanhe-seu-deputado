// SPDX-License-Identifier: AGPL-3.0-or-later

export function dateToTimestamp(dateStr: string): number {
  return new Date(dateStr).getTime();
}

export function convertToCents(value: number): number {
  return Math.round(value * 100);
}
