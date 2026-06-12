// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';
import type { IPipelineDepChain } from '../../types/Pipeline';
import { ExpensesPipeline } from '../dados-abertos-camara/ExpensesPipeline';
import { ReceitaFederalCNPJPipeline } from '../receita-federal/ReceitaFederalCNPJPipeline';
import { TSE2022ElectionResultsPipeline } from '../tse-dados-abertos/TSE2022ElectionResultsPipeline';
import { ForensicFlag } from './ForensicFlag';
import { ForensicFlagsRepository } from '../../repositories/ForensicFlagsRepository';

/**
 * Forensic flag: POLITICALLY_CONNECTED_VENDOR
 *
 * Flags expenses where a vendor's registered partner appears in the tse_candidates
 * table, indicating political connections.
 */
export class PoliticallyConnectedVendorPipeline {
  static readonly dependencies: readonly IPipelineDepChain[] = [
    ExpensesPipeline,
    ReceitaFederalCNPJPipeline,
    TSE2022ElectionResultsPipeline,
  ];

  private readonly repo: ForensicFlagsRepository;

  constructor(db: Database.Database) {
    this.repo = new ForensicFlagsRepository(db);
  }

  async execute(): Promise<void> {
    this.repo.insertPoliticallyConnectedVendor(ForensicFlag.POLITICALLY_CONNECTED_VENDOR);
    console.log('PoliticallyConnectedVendorPipeline completed');
    return Promise.resolve();
  }
}
