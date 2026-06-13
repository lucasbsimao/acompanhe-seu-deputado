// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';
import type { IPipelineDepChain } from '../../types/Pipeline';
import { ExpensesPipeline } from '../dados-abertos-camara/ExpensesPipeline';
import { ForensicFlag } from './ForensicFlag';
import { ForensicFlagsRepository } from '../../repositories/ForensicFlagsRepository';

const SN_PLACEHOLDERS: readonly string[] = ['S/N', 'SN', 'S.N.', 'S/Nº', '00', '000', '0', '-', ''];

/**
 * Forensic flag: CROSS_POLITICIAN_INVOICE_REUSE
 *
 * Flags expenses where the same invoice number from the same vendor appears
 * under two or more distinct politicians in the CEAP database.
 * Known serial-number placeholders (S/N, SN, S.N., S/Nº, 00, 000, 0, -, "")
 * are excluded to avoid false positives on blank or zero invoice fields.
 *
 * A vendor can only legitimately issue each invoice once; reuse across politicians
 * indicates double-billing by the vendor, coordinated ghost invoicing, or
 * expense entry errors involving the same physical document across different
 * political offices.
 *
 * Co-occurs with {@link ForensicFlag.SINGLE_CLIENT_VENDOR} when the vendor
 * services exclusively one party's caucus, suggesting coordinated over-billing
 * rather than clerical error.
 */
export class CrossPoliticianInvoiceReusePipeline {
  static readonly dependencies: readonly IPipelineDepChain[] = [ExpensesPipeline];

  private readonly repo: ForensicFlagsRepository;

  constructor(db: Database.Database) {
    this.repo = new ForensicFlagsRepository(db);
  }

  execute(): Promise<void> {
    this.repo.insertCrossPoliticianInvoiceReuse(
      ForensicFlag.CROSS_POLITICIAN_INVOICE_REUSE,
      SN_PLACEHOLDERS,
    );
    console.log('CrossPoliticianInvoiceReusePipeline completed');
    return Promise.resolve();
  }
}
