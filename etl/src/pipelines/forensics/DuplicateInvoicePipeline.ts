// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';
import type { IPipelineDepChain } from '../../types/Pipeline';
import { ExpensesPipeline } from '../dados-abertos-camara/ExpensesPipeline';
import { ForensicFlag } from './ForensicFlag';
import { ForensicFlagsRepository } from '../../repositories/ForensicFlagsRepository';
import { logger } from '../../util/logger';
import { SN_PLACEHOLDERS } from '../../types/SnPlaceholders';

/**
 * Forensic flag: DUPLICATE_INVOICE
 *
 * Flags expenses where the same invoice number from the same vendor appears
 * twice or more under the SAME politician.
 *
 * ### Difference from {@link CrossPoliticianInvoiceReusePipeline}
 * - {@link ForensicFlag.DUPLICATE_INVOICE} (this pipeline): This signal detects potential
 *   double-billing or clerical errors where multiple expenses are filed for the
 *   SAME physical receipt by the SAME politician's office.
 * - {@link ForensicFlag.CROSS_POLITICIAN_INVOICE_REUSE}: Detects reuse of the same invoice
 *   across DIFFERENT politicians.
 *
 * Note: This flag does not auto-escalate because legitimate scenarios exist
 * (e.g., installments or partial payments sharing an invoice number)
 * and because of the non-zero false positive rate (FPR).
 */
export class DuplicateInvoicePipeline {
  static readonly dependencies: readonly IPipelineDepChain[] = [ExpensesPipeline];

  private readonly repo: ForensicFlagsRepository;

  constructor(db: Database.Database) {
    this.repo = new ForensicFlagsRepository(db);
  }

  execute(): Promise<void> {
    const rowsInserted = this.repo.insertDuplicateInvoice(
      ForensicFlag.DUPLICATE_INVOICE,
      SN_PLACEHOLDERS,
    );
    logger.info(
      { flag: ForensicFlag.DUPLICATE_INVOICE, rowsInserted },
      'forensic pipeline completed',
    );
    return Promise.resolve();
  }
}
