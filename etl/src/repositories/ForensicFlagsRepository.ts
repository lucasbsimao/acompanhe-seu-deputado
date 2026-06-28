// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';
import type { ForensicFlag } from '../pipelines/forensics/ForensicFlag';
import { FORENSIC_FLAG_SCORES } from '../pipelines/forensics/ForensicFlag';
import { CompanySize } from '../types/CompanySize';
import {
  CROSS_POLITICIAN_INVOICE_REUSE_SQL,
  CNPJ_POSTDATES_EXPENSE_SQL,
  CNPJ_INACTIVE_AT_EXPENSE_SQL,
  CNPJ_MISSING_ESTABLISHMENT_SQL,
  VENDOR_CNAE_MISMATCH_SQL,
  FRESHLY_REGISTERED_VENDOR_SQL,
  VENDOR_NO_EMPLOYEES_SQL,
  POLITICALLY_CONNECTED_VENDOR_SQL,
  COMPETENCY_DATE_MISMATCH_SQL,
  UNCLASSIFIED_EXPENSE_SQL,
  CAMPAIGN_DONOR_VENDOR_SQL,
  SINGLE_CLIENT_VENDOR_SQL,
} from './ForensicFlagsQueries';
import { PoliticianRole } from '../types/PoliticianRole';

export class ForensicFlagsRepository {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  insertCrossPoliticianInvoiceReuse(
    flagName: ForensicFlag,
    excludedSerialNumbers: readonly string[],
  ): void {
    const score = FORENSIC_FLAG_SCORES[flagName];
    const snJson = JSON.stringify(excludedSerialNumbers);
    this.db.prepare(CROSS_POLITICIAN_INVOICE_REUSE_SQL).run(flagName, score, snJson, snJson);
  }

  insertCnpjPostdatesExpense(flagName: ForensicFlag): void {
    const score = FORENSIC_FLAG_SCORES[flagName];
    this.db.prepare(CNPJ_POSTDATES_EXPENSE_SQL).run(flagName, score);
  }

  insertCnpjInactiveAtExpense(flagName: ForensicFlag, inactiveStatuses: readonly string[]): void {
    const score = FORENSIC_FLAG_SCORES[flagName];
    const statusesJson = JSON.stringify(inactiveStatuses);
    this.db.prepare(CNPJ_INACTIVE_AT_EXPENSE_SQL).run(flagName, score, statusesJson);
  }

  insertCnpjMissingEstablishment(flagName: ForensicFlag, pipelineDependency: string): void {
    const score = FORENSIC_FLAG_SCORES[flagName];
    this.db.prepare(CNPJ_MISSING_ESTABLISHMENT_SQL).run(flagName, score, pipelineDependency);
  }

  insertVendorCnaeMismatch(
    flagName: ForensicFlag,
    incompatibleExpenseTypes: readonly string[],
  ): void {
    const score = FORENSIC_FLAG_SCORES[flagName];
    const expenseTypesJson = JSON.stringify(incompatibleExpenseTypes);
    this.db.prepare(VENDOR_CNAE_MISMATCH_SQL).run(flagName, score, expenseTypesJson);
  }

  insertFreshlyRegisteredVendor(flagName: ForensicFlag): void {
    this.db.prepare(FRESHLY_REGISTERED_VENDOR_SQL).run(flagName);
  }

  insertVendorNoEmployees(flagName: ForensicFlag, expenseTypes: readonly string[]): void {
    const expenseTypesJson = JSON.stringify(expenseTypes);
    this.db
      .prepare(VENDOR_NO_EMPLOYEES_SQL)
      .run(flagName, expenseTypesJson, CompanySize.MICRO_EMPRESA);
  }

  insertPoliticallyConnectedVendor(flagName: ForensicFlag): void {
    const score = FORENSIC_FLAG_SCORES[flagName];
    this.db.prepare(POLITICALLY_CONNECTED_VENDOR_SQL).run(flagName, score);
  }

  insertCompetencyDateMismatch(flagName: ForensicFlag): void {
    const score = FORENSIC_FLAG_SCORES[flagName];
    this.db.prepare(COMPETENCY_DATE_MISMATCH_SQL).run(flagName, score);
  }

  insertUnclassifiedExpense(flagName: ForensicFlag): void {
    const score = FORENSIC_FLAG_SCORES[flagName];
    this.db.prepare(UNCLASSIFIED_EXPENSE_SQL).run(flagName, score, PoliticianRole.SENATOR);
  }

  insertCampaignDonorVendor(flagName: ForensicFlag): void {
    const score = FORENSIC_FLAG_SCORES[flagName];
    this.db.prepare(CAMPAIGN_DONOR_VENDOR_SQL).run(flagName, score);
  }

  insertSingleClientVendor(flagName: ForensicFlag): void {
    const score = FORENSIC_FLAG_SCORES[flagName];
    this.db.prepare(SINGLE_CLIENT_VENDOR_SQL).run(flagName, score);
  }
}
