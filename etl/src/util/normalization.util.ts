// SPDX-License-Identifier: AGPL-3.0-or-later

export function normalizeId(id: string): string {
  return id
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function normalizeNumericText(text: string): string {
  return text.replace(/\D/g, '');
}

export function normalizeLabel(text: string): string {
  return text
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim();
}

export function normalizeNameForMatching(name: string): string {
  return name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
