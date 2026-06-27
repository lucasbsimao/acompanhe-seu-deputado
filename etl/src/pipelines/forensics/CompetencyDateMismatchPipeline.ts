// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';
import type { IPipelineDepChain } from '../../types/Pipeline';
import { ExpensesPipeline } from '../dados-abertos-camara/ExpensesPipeline';
import { ForensicFlag } from './ForensicFlag';
import { ForensicFlagsRepository } from '../../repositories/ForensicFlagsRepository';

/**
 * Forensic flag: COMPETENCY_DATE_MISMATCH
 *
 * Flags expenses where the document date (`data_documento`) is more than 90 days
 * before the competency period (year/month).
 *
 * Per CEAP regulations (Resolução da Mesa nº 43/2009 for Câmara), expenses
 * must be submitted within 90 days of the competency period. Large gaps
 * between the ostensible invoice date and the period it was charged to suggest
 * either bookkeeping errors or attempts to use remaining quota from a past
 * period with recently "found" invoices.
 *
 * Only applied when both `competency_year` and `competency_month` are non-null.
 */
export class CompetencyDateMismatchPipeline {
  static readonly dependencies: readonly IPipelineDepChain[] = [ExpensesPipeline];

  private readonly repo: ForensicFlagsRepository;

  constructor(db: Database.Database) {
    this.repo = new ForensicFlagsRepository(db);
  }

  execute(): Promise<void> {
    this.repo.insertCompetencyDateMismatch(ForensicFlag.COMPETENCY_DATE_MISMATCH);
    console.log('CompetencyDateMismatchPipeline completed');
    return Promise.resolve();
  }
}
