// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';
import type { IPipelineDepChain } from '../../types/Pipeline';
import { ExpensesPipeline } from '../dados-abertos-camara/ExpensesPipeline';
import { ReceitaFederalCNPJPipeline } from '../receita-federal/ReceitaFederalCNPJPipeline';
import { TSECampaignDonationsPipeline } from '../tse-dados-abertos/TSECampaignDonationsPipeline';
import { ForensicFlag } from './ForensicFlag';
import { ForensicFlagsRepository } from '../../repositories/ForensicFlagsRepository';
import { logger } from '../../util/logger';

/**
 * Forensic flag: CAMPAIGN_DONOR_VENDOR
 *
 * Flags expenses where a vendor's partner was also a campaign donor to the same
 * politician who paid the vendor.
 *
 * This signal detects potential "Locação Fantasma" (ghost leasing) schemes where
 * campaign support is rewarded with Ceap-funded contracts, or where the vendor
 * is a shell company used to cycle public funds back to the politician or their
 * campaign contributors.
 *
 * Higher score (30pt) reflects the direct conflict of interest when a vendor's
 * owner/partner is financially tied to the politician's election campaign.
 */
export class CampaignDonorVendorPipeline {
  static readonly dependencies: readonly IPipelineDepChain[] = [
    ExpensesPipeline,
    ReceitaFederalCNPJPipeline,
    TSECampaignDonationsPipeline,
  ];

  private readonly repo: ForensicFlagsRepository;

  constructor(db: Database.Database) {
    this.repo = new ForensicFlagsRepository(db);
  }

  execute(): Promise<void> {
    const rowsInserted = this.repo.insertCampaignDonorVendor(ForensicFlag.CAMPAIGN_DONOR_VENDOR);
    logger.info(
      { flag: ForensicFlag.CAMPAIGN_DONOR_VENDOR, rowsInserted },
      'forensic pipeline completed',
    );
    return Promise.resolve();
  }
}
