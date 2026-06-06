import type Database from 'better-sqlite3';
import type { IPipelineDepChain } from '../../types/Pipeline';
import { ExpensesPipeline } from '../dados-abertos-camara/ExpensesPipeline';
import { ForensicFlag } from './ForensicFlag';
import { ForensicFlagsRepository } from '../../repositories/ForensicFlagsRepository';

const SN_PLACEHOLDERS: readonly string[] = ['S/N', 'SN', 'S.N.', 'S/Nº', '00', '000', '0', '-', ''];

export class CrossDeputyInvoiceReusePipeline {
  static readonly dependencies: readonly IPipelineDepChain[] = [ExpensesPipeline];

  private readonly repo: ForensicFlagsRepository;

  constructor(db: Database.Database) {
    this.repo = new ForensicFlagsRepository(db);
  }

  execute(): Promise<void> {
    this.repo.insertCrossDeputyInvoiceReuse(ForensicFlag.CROSS_DEPUTY_INVOICE_REUSE, SN_PLACEHOLDERS);
    console.log('CrossDeputyInvoiceReusePipeline completed');
    return Promise.resolve();
  }
}
