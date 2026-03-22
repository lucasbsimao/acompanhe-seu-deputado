export function dateToTimestamp(dateStr: string): number {
  return new Date(dateStr).getTime();
}

export function convertToCents(value: number): number {
  if (value >= 100 || value === 0) {
    return Math.round(value * 100);
  }
  return Math.round(value);
}
