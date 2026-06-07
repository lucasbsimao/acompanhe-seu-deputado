import type Database from 'better-sqlite3';
import type { IPipelineDepChain } from '../../types/Pipeline';
import { ExpensesPipeline } from '../dados-abertos-camara/ExpensesPipeline';
import { ReceitaFederalCNPJPipeline } from '../receita-federal/ReceitaFederalCNPJPipeline';
import { ForensicFlag } from './ForensicFlag';
import { ForensicFlagsRepository } from '../../repositories/ForensicFlagsRepository';

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
