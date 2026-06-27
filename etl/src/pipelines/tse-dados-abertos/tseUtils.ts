// SPDX-License-Identifier: AGPL-3.0-or-later

import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import type { TSECandidate } from '../../types/TSECandidate';

export function parseCSVFile(filePath: string): TSECandidate[] {
  const content = readFileSync(filePath, { encoding: 'latin1' });
  const records = parse(content, {
    columns: true,
    delimiter: ';',
    skip_empty_lines: true,
    relax_quotes: true,
  }) as TSECandidate[];
  return records;
}
