import type Database from 'better-sqlite3';
import type { IPipelineDepChain } from '../../types/Pipeline';
import { ExpensesPipeline } from '../dados-abertos-camara/ExpensesPipeline';
import { ReceitaFederalCNPJPipeline } from '../receita-federal/ReceitaFederalCNPJPipeline';
import { ForensicFlag } from './ForensicFlag';
import { ForensicFlagsRepository } from '../../repositories/ForensicFlagsRepository';

const INACTIVE_STATUSES = ['BAIXADA', 'INAPTA', 'SUSPENSA'] as const;

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
