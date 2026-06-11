import type Database from 'better-sqlite3';
import type { IPipelineDepChain } from '../../types/Pipeline';
import { ExpensesPipeline } from '../dados-abertos-camara/ExpensesPipeline';
import { ReceitaFederalCNPJPipeline } from '../receita-federal/ReceitaFederalCNPJPipeline';
import { ForensicFlag } from './ForensicFlag';
import { ForensicFlagsRepository } from '../../repositories/ForensicFlagsRepository';

/**
 * Forensic flag: CNPJ_MISSING_ESTABLISHMENT
 *
 * Flags expenses where the 14-digit CNPJ billed under CEAP has no corresponding
 * establishment record in the Receita Federal data.
 * Only raised when ReceitaFederalCNPJPipeline ran successfully within the last
 * 45 days — this guard prevents false positives from stale lookups.
 *
 * A CNPJ appearing in official congressional expenses with no Receita Federal
 * record is either fictitious, permanently canceled at the root entity level,
 * or never legitimately incorporated.
 *
 * Co-occurs with {@link ForensicFlag.CNPJ_INACTIVE_AT_EXPENSE} and
 * {@link ForensicFlag.CNPJ_POSTDATES_EXPENSE} in multi-layer CNPJ
 * anomaly escalation.
 */
export class CnpjMissingEstablishmentPipeline {
  static readonly dependencies: readonly IPipelineDepChain[] = [
    ExpensesPipeline,
    ReceitaFederalCNPJPipeline,
  ];

  private readonly repo: ForensicFlagsRepository;

  constructor(db: Database.Database) {
    this.repo = new ForensicFlagsRepository(db);
  }

  execute(): Promise<void> {
    this.repo.insertCnpjMissingEstablishment(
      ForensicFlag.CNPJ_MISSING_ESTABLISHMENT,
      ReceitaFederalCNPJPipeline.name,
    );
    console.log('CnpjMissingEstablishmentPipeline completed');
    return Promise.resolve();
  }
}
