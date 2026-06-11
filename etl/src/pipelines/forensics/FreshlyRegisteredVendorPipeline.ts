import type Database from 'better-sqlite3';
import type { IPipelineDepChain } from '../../types/Pipeline';
import { ExpensesPipeline } from '../dados-abertos-camara/ExpensesPipeline';
import { ReceitaFederalCNPJPipeline } from '../receita-federal/ReceitaFederalCNPJPipeline';
import { ForensicFlag } from './ForensicFlag';
import { ForensicFlagsRepository } from '../../repositories/ForensicFlagsRepository';

/**
 * Forensic flag: FRESHLY_REGISTERED_VENDOR
 *
 * Flags expenses where the vendor's CNPJ was opened fewer than 90 days before
 * its first CEAP expense across all deputies.
 * The gap is computed as: julianday(first_expense_date) − julianday(opening_date).
 *
 * Score tiers:
 *   gap ≤ 7 days  → score 50  (vendor created same week as first billing)
 *   gap 8–89 days → score 25  (vendor very new at time of first billing)
 *   gap ≥ 90 days → not flagged
 *
 * Vendors created days or weeks before their first congressional invoice are a
 * classic hallmark of shell companies purpose-built to channel public funds.
 * The ≤7-day sub-group auto-escalates because same-week incorporation and billing
 * is virtually impossible for any legitimate business.
 *
 * Only applied to 14-digit CNPJs with a non-null opening_date. Gap < 0 is excluded
 * to avoid overlap with {@link ForensicFlag.CNPJ_POSTDATES_EXPENSE}, which handles
 * the case where the CNPJ did not yet exist at all.
 *
 * Co-occurs with {@link ForensicFlag.CNPJ_POSTDATES_EXPENSE},
 * {@link ForensicFlag.VENDOR_GEOGRAPHIC_ANOMALY}, and
 * {@link ForensicFlag.POLITICALLY_CONNECTED_VENDOR} in composite
 * shell-company escalation.
 */
export class FreshlyRegisteredVendorPipeline {
  static readonly dependencies: readonly IPipelineDepChain[] = [
    ExpensesPipeline,
    ReceitaFederalCNPJPipeline,
  ];

  private readonly repo: ForensicFlagsRepository;

  constructor(db: Database.Database) {
    this.repo = new ForensicFlagsRepository(db);
  }

  execute(): Promise<void> {
    this.repo.insertFreshlyRegisteredVendor(ForensicFlag.FRESHLY_REGISTERED_VENDOR);
    console.log('FreshlyRegisteredVendorPipeline completed');
    return Promise.resolve();
  }
}
