// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';
import type { IPipelineDepChain } from '../../types/Pipeline';
import { ExpensesPipeline } from '../dados-abertos-camara/ExpensesPipeline';
import { ReceitaFederalCNPJPipeline } from '../receita-federal/ReceitaFederalCNPJPipeline';
import { ReceitaFederalSimplesPipeline } from '../receita-federal/ReceitaFederalSimplesPipeline';
import { ForensicFlag } from './ForensicFlag';
import { ForensicFlagsRepository } from '../../repositories/ForensicFlagsRepository';
import { logger } from '../../util/logger';

const TARGET_EXPENSE_TYPES = [
  'SERVICO DE SEGURANCA',
  'MANUTENCAO DE ESCRITORIO',
  'LOCACAO OU FRETAMENTO DE VEICULOS',
] as const;

/**
 * Forensic flag: VENDOR_NO_EMPLOYEES
 *
 * Flags vendors who plausibly have zero employees (Micro-empresas or MEIs)
 * but are billing for labor-intensive services like security, office maintenance,
 * or vehicle leasing.
 *
 * Scoring logic:
 * - 20 pt: Confirmed zero employees (employee_count = 0 from SIMPLES/RAIS data)
 * - 10 pt: Proxy signal (company_size = CompanySize.MICRO_EMPRESA ('01') and employee_count IS NULL)
 *
 * Restricted to specific expense types where zero employees is operationally implausible.
 */
export class VendorNoEmployeesPipeline {
  static readonly dependencies: readonly IPipelineDepChain[] = [
    ExpensesPipeline,
    ReceitaFederalCNPJPipeline,
    ReceitaFederalSimplesPipeline,
  ];

  private readonly repo: ForensicFlagsRepository;

  constructor(db: Database.Database) {
    this.repo = new ForensicFlagsRepository(db);
  }

  execute(): Promise<void> {
    const rowsInserted = this.repo.insertVendorNoEmployees(
      ForensicFlag.VENDOR_NO_EMPLOYEES,
      TARGET_EXPENSE_TYPES,
    );
    logger.info(
      { flag: ForensicFlag.VENDOR_NO_EMPLOYEES, rowsInserted },
      'forensic pipeline completed',
    );
    return Promise.resolve();
  }
}
