// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';
import type { IPipelineDepChain } from '../../types/Pipeline';
import { ExpensesPipeline } from '../dados-abertos-camara/ExpensesPipeline';
import { ForensicFlag } from './ForensicFlag';
import { ForensicFlagsRepository } from '../../repositories/ForensicFlagsRepository';
import { logger } from '../../util/logger';

/**
 * Forensic flag: SINGLE_CLIENT_VENDOR
 *
 * Flags expenses where a vendor receives funds from only one politician
 * across a significant number of transactions (5+).
 *
 * This signal detects potential shell companies or "exclusive" vendors that
 * may have been created solely to serve a specific politician, a common
 * indicator of ghost companies or service overbilling.
 */
export class SingleClientVendorPipeline {
  static readonly dependencies: readonly IPipelineDepChain[] = [ExpensesPipeline];

  private readonly repo: ForensicFlagsRepository;

  constructor(db: Database.Database) {
    this.repo = new ForensicFlagsRepository(db);
  }

  execute(): Promise<void> {
    const rowsInserted = this.repo.insertSingleClientVendor(ForensicFlag.SINGLE_CLIENT_VENDOR);
    logger.info(
      { flag: ForensicFlag.SINGLE_CLIENT_VENDOR, rowsInserted },
      'forensic pipeline completed',
    );
    return Promise.resolve();
  }
}
