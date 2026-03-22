export function normalizeId(id: string): string {
  return id
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function normalizeNumericText(text: string): string {
  return text.replace(/\D/g, '');
}
