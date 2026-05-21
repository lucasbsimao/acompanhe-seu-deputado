export function dateToTimestamp(dateStr: string): number {
  return new Date(dateStr).getTime();
}

export function convertToCents(value: number): number {
  return Math.round(value * 100);
}
