import type Database from 'better-sqlite3';
import type { IPipelineDepChain } from '../../types/Pipeline';
import { ExpensesPipeline } from '../dados-abertos-camara/ExpensesPipeline';
import { ReceitaFederalCNPJPipeline } from '../receita-federal/ReceitaFederalCNPJPipeline';
import { ForensicFlag } from './ForensicFlag';
import { ForensicFlagsRepository } from '../../repositories/ForensicFlagsRepository';

const INCOMPATIBLE_EXPENSE_TYPES = [
  'MANUTENCAO DE ESCRITORIO',
  'LOCACAO OU FRETAMENTO DE VEICULOS',
  'SERVICO DE SEGURANCA',
] as const;

/**
 * Forensic flag: VENDOR_CNAE_MISMATCH
 *
 * Flags expenses where the vendor's primary CNAE activity code falls in a division
 * that is structurally incompatible with the declared expense category.
 * Only unambiguous mismatches are flagged — agribusiness, mining, and manufacturing
 * companies have no plausible reason to bill office maintenance, vehicle leasing,
 * or security services under CEAP.
 *
 * Incompatibility matrix (all × all):
 *   CNAE divisions 01–03 (agriculture/fishing)  ┐
 *   CNAE divisions 05–09 (mining)               ├─ × MANUTENCAO DE ESCRITORIO
 *   CNAE divisions 10–33 (manufacturing, full   ┘   LOCACAO OU FRETAMENTO DE VEICULOS
 *                         CNAE Section C)           SERVICO DE SEGURANCA
 *
 * Empirically validated: three agribusiness vendors (CNAE 0151-2 Bovinocultura,
 * 0162-8 Atividades de apoio à pecuária) billed R$14.25M under MANUTENCAO DE
 * ESCRITORIO; one of them is in recuperação judicial.
 *
 * Co-occurs with {@link ForensicFlag.POLITICALLY_CONNECTED_VENDOR} and
 * {@link ForensicFlag.VENDOR_GEOGRAPHIC_ANOMALY} in composite escalation.
 */
export class VendorCnaeMismatchPipeline {
  static readonly dependencies: readonly IPipelineDepChain[] = [
    ExpensesPipeline,
    ReceitaFederalCNPJPipeline,
  ];

  private readonly repo: ForensicFlagsRepository;

  constructor(db: Database.Database) {
    this.repo = new ForensicFlagsRepository(db);
  }

  execute(): Promise<void> {
    this.repo.insertVendorCnaeMismatch(
      ForensicFlag.VENDOR_CNAE_MISMATCH,
      INCOMPATIBLE_EXPENSE_TYPES,
    );
    console.log('VendorCnaeMismatchPipeline completed');
    return Promise.resolve();
  }
}
