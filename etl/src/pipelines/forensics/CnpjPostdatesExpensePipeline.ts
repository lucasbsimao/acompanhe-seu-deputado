import type Database from 'better-sqlite3';
import type { IPipelineDepChain } from '../../types/Pipeline';
import { ExpensesPipeline } from '../dados-abertos-camara/ExpensesPipeline';
import { ReceitaFederalCNPJPipeline } from '../receita-federal/ReceitaFederalCNPJPipeline';
import { ForensicFlag } from './ForensicFlag';
import { ForensicFlagsRepository } from '../../repositories/ForensicFlagsRepository';

/**
 * Forensic flag: CNPJ_POSTDATES_EXPENSE
 *
 * Flags expenses where the vendor's CNPJ opening date is later than the expense
 * document date — the vendor was legally registered after the invoice was
 * ostensibly issued.
 *
 * This is a logically impossible scenario: a company cannot issue a valid invoice
 * before it legally exists. Presence in CEAP data suggests either backdated
 * expense entries or a CNPJ retroactively created to justify a payment.
 *
 * Only applied to 14-digit CNPJs with a non-null opening_date.
 * Complementary to {@link ForensicFlag.FRESHLY_REGISTERED_VENDOR} — that flag
 * handles gap_days ≥ 0 (vendor existed but was very new); this flag handles
 * gap_days < 0 (vendor did not yet exist at all).
 *
 * Co-occurs with {@link ForensicFlag.CNPJ_INACTIVE_AT_EXPENSE} and
 * {@link ForensicFlag.CNPJ_MISSING_ESTABLISHMENT} in composite CNPJ
 * lifecycle anomaly escalation.
 */
export class CnpjPostdatesExpensePipeline {
  static readonly dependencies: readonly IPipelineDepChain[] = [
    ExpensesPipeline,
    ReceitaFederalCNPJPipeline,
  ];

  private readonly repo: ForensicFlagsRepository;

  constructor(db: Database.Database) {
    this.repo = new ForensicFlagsRepository(db);
  }

  execute(): Promise<void> {
    this.repo.insertCnpjPostdatesExpense(ForensicFlag.CNPJ_POSTDATES_EXPENSE);
    console.log('CnpjPostdatesExpensePipeline completed');
    return Promise.resolve();
  }
}
