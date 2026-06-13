// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';
import { HttpClient } from '../../core/HttpClient';
import { PoliticianRepository } from '../../repositories/PoliticianRepository';
import { ExpensesRepository, type ExpenseRow } from '../../repositories/ExpensesRepository';
import { SenatorsPipeline } from './SenatorsPipeline';
import type { IPipelineDepChain } from '../../types/Pipeline';
import { normalizeLabel, normalizeNumericText } from '../../util/normalization.util';
import { mapCeapsDocumentType } from '../../types/CodTipoDocumento';
import defaultConfig from '../../config/defaults.json';

interface CeapsExpenseDto {
  id: number;
  codSenador: number;
  tipoDespesa: string;
  tipoDocumento: string;
  data: string;
  documento: string;
  fornecedor: string;
  cpfCnpj: string;
  valorReembolsado: number;
}

export class CeapsExpensesPipeline {
  static readonly dependencies: readonly IPipelineDepChain[] = [SenatorsPipeline];

  private readonly politicianRepo: PoliticianRepository;
  private readonly expensesRepo: ExpensesRepository;
  private readonly httpClient: HttpClient;

  constructor(db: Database.Database) {
    this.politicianRepo = new PoliticianRepository(db);
    this.expensesRepo = new ExpensesRepository(db);
    this.httpClient = new HttpClient(
      {
        maxRetries: defaultConfig.pagination.maxRetries,
        retryWaitMin: defaultConfig.pagination.retryWaitMin,
        retryWaitMax: defaultConfig.pagination.retryWaitMax,
      },
      defaultConfig.pagination.timeoutMs,
    );
  }

  async execute(forceDownload = false): Promise<void> {
    const senatorMap = this.politicianRepo.getSenatorCodeToCpfMap();
    const yearsToFetch = defaultConfig.senateExpenses.yearsToFetch;
    const currentYear = new Date().getFullYear();

    for (let i = 0; i < yearsToFetch; i++) {
      const year = currentYear - i;

      if (!forceDownload && this.expensesRepo.hasExpensesForSenatorYear(year)) {
        console.log(`Skipping CEAPS expenses for year ${year} (already exists)`);
        continue;
      }

      console.log(`Fetching CEAPS expenses for year ${year}...`);
      const url = `https://adm.senado.gov.br/adm-dadosabertos/api/v1/senadores/despesas_ceaps/${year}`;

      try {
        const response = await this.httpClient.request(url);
        const records = (response.data as { despesasCeaps: CeapsExpenseDto[] }).despesasCeaps;

        const rows: ExpenseRow[] = [];
        for (const expense of records) {
          const senatorCpf = senatorMap.get(String(expense.codSenador));

          if (!senatorCpf) {
            console.warn(
              `Unknown senator code: ${expense.codSenador} for expense ID ${expense.id}`,
            );
            continue;
          }

          rows.push({
            id: String(expense.id),
            deputyId: senatorCpf,
            tipoDespesa: normalizeLabel(expense.tipoDespesa),
            codDocumento: String(expense.id),
            codTipoDocumento: mapCeapsDocumentType(expense.tipoDocumento),
            dataDocumento: expense.data,
            numDocumento: expense.documento,
            urlDocumento: null,
            nomeFornecedor: expense.fornecedor,
            cnpjCpfFornecedor: normalizeNumericText(expense.cpfCnpj),
            valorLiquido: Math.round(expense.valorReembolsado * 100),
            valorGlosa: 0,
          });
        }

        if (rows.length > 0) {
          this.expensesRepo.insertBatch(rows);
          console.log(`Inserted ${rows.length} CEAPS expenses for year ${year}`);
        }
      } catch (error) {
        console.error(`Failed to fetch CEAPS expenses for year ${year}:`, error);
        throw error;
      }
    }
  }
}
