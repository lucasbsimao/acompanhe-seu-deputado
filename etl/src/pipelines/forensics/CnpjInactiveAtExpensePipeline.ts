// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';
import type { IPipelineDepChain } from '../../types/Pipeline';
import { ExpensesPipeline } from '../dados-abertos-camara/ExpensesPipeline';
import { ReceitaFederalCNPJPipeline } from '../receita-federal/ReceitaFederalCNPJPipeline';
import { ForensicFlag } from './ForensicFlag';
import { ForensicFlagsRepository } from '../../repositories/ForensicFlagsRepository';

const INACTIVE_STATUSES = ['BAIXADA', 'INAPTA', 'SUSPENSA'] as const;

/**
 * Forensic flag: CNPJ_INACTIVE_AT_EXPENSE
 *
 * Flags expenses where the vendor's CNPJ was already in an inactive registration
 * status at the time the expense document was issued.
 * Checked statuses: BAIXADA (closed), INAPTA (unfit/non-compliant), SUSPENSA (suspended).
 * The status must have been effective on or before the expense date.
 *
 * A vendor with a closed or suspended registration cannot legally issue invoices;
 * its presence in CEAP data strongly suggests ghost-company billing or
 * retroactive expense fabrication.
 *
 * Co-occurs with {@link ForensicFlag.CNPJ_MISSING_ESTABLISHMENT} when the
 * vendor is both inactive and absent from the Receita Federal establishment
 * records, and with {@link ForensicFlag.FRESHLY_REGISTERED_VENDOR} in
 * compound vendor lifecycle anomaly escalation.
 */
export class CnpjInactiveAtExpensePipeline {
  static readonly dependencies: readonly IPipelineDepChain[] = [
    ExpensesPipeline,
    ReceitaFederalCNPJPipeline,
  ];

  private readonly repo: ForensicFlagsRepository;

  constructor(db: Database.Database) {
    this.repo = new ForensicFlagsRepository(db);
  }

  execute(): Promise<void> {
    this.repo.insertCnpjInactiveAtExpense(ForensicFlag.CNPJ_INACTIVE_AT_EXPENSE, INACTIVE_STATUSES);
    console.log('CnpjInactiveAtExpensePipeline completed');
    return Promise.resolve();
  }
}
