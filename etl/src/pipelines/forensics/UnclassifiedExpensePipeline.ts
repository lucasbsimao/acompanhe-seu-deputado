// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';
import type { IPipelineDepChain } from '../../types/Pipeline';
import { SenatorsExpensesPipeline } from '../dados-abertos-senado/SenatorsExpensesPipeline';
import { ForensicFlag } from './ForensicFlag';
import { ForensicFlagsRepository } from '../../repositories/ForensicFlagsRepository';

/**
 * Forensic flag: UNCLASSIFIED_EXPENSE
 *
 * Flags senator CEAPS expenses where `tipoDespesa` is null or empty.
 *
 * The Senate open-data API sometimes returns expenses without a classification.
 * These records are problematic for oversight because they lack the context
 * needed to verify if the expense is legitimate or within quota limits.
 *
 * These records also cannot be enriched with document URLs because they don't
 * appear on the transparency portal under any CEAPS category. Besides they seem
 * to be always be of the type 'Recibo'.
 */
export class UnclassifiedExpensePipeline {
  static readonly dependencies: readonly IPipelineDepChain[] = [SenatorsExpensesPipeline];

  private readonly repo: ForensicFlagsRepository;

  constructor(db: Database.Database) {
    this.repo = new ForensicFlagsRepository(db);
  }

  execute(): Promise<void> {
    this.repo.insertUnclassifiedExpense(ForensicFlag.UNCLASSIFIED_EXPENSE);
    console.log('UnclassifiedExpensePipeline completed');
    return Promise.resolve();
  }
}
