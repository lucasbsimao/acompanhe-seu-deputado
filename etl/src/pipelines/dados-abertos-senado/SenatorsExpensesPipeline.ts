// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';
import { HttpClient } from '../../core/HttpClient';
import { PoliticianRepository } from '../../repositories/PoliticianRepository';
import { ExpensesRepository, type ExpenseRow } from '../../repositories/ExpensesRepository';
import { PoliticianLookupService } from '../../services/PoliticianLookupService';
import { SenatorsPipeline } from './SenatorsPipeline';
import type { IPipelineDepChain } from '../../types/Pipeline';
import { normalizeLabel, normalizeNumericText } from '../../util/normalization.util';
import { mapCeapsDocumentType } from '../../mappers/CodTipoDocumento.mapper';
import defaultConfig from '../../config/defaults.json';

interface CeapsExpenseDto {
  id: number;
  codSenador: number;
  tipoDespesa: string | null;
  tipoDocumento: string;
  data: string;
  documento: string | null;
  fornecedor: string;
  cpfCnpj: string;
  valorReembolsado: number;
}

export class SenatorsExpensesPipeline {
  static readonly dependencies: readonly IPipelineDepChain[] = [SenatorsPipeline];

  private readonly politicianRepo: PoliticianRepository;
  private readonly expensesRepo: ExpensesRepository;
  private readonly lookupService: PoliticianLookupService;
  private readonly httpClient: HttpClient;

  constructor(db: Database.Database) {
    this.politicianRepo = new PoliticianRepository(db);
    this.expensesRepo = new ExpensesRepository(db);
    this.lookupService = new PoliticianLookupService(this.politicianRepo);
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
    const senatorMap = this.politicianRepo.getSenatorCodeToCpfMap() as Map<string, string | null>;
    const yearsToFetch = defaultConfig.senateExpenses.yearsToFetch;
    const currentYear = new Date().getFullYear();

    const years = Array.from({ length: yearsToFetch }, (_, i) => currentYear - i);
    const maxParallelism = 10;

    for (let i = 0; i < years.length; i += maxParallelism) {
      const batch = years.slice(i, i + maxParallelism);
      await Promise.all(
        batch.map(year => this.fetchAndPersistYear(year, senatorMap, forceDownload)),
      );
    }
  }

  private async fetchAndPersistYear(
    year: number,
    senatorMap: Map<string, string | null>,
    forceDownload: boolean,
  ): Promise<void> {
    if (!forceDownload && this.expensesRepo.hasExpensesForSenatorYear(year)) {
      console.log(`Skipping CEAPS expenses for year ${year} (already exists)`);
      return;
    }

    console.log(`Fetching CEAPS expenses for year ${year}...`);
    const url = `https://adm.senado.gov.br/adm-dadosabertos/api/v1/senadores/despesas_ceaps/${year}`;

    try {
      const response = await this.httpClient.request(url);
      const records = response.data;

      if (!Array.isArray(records)) {
        throw new Error(`Expected array of expenses, got ${typeof records}`);
      }

      const ceapsRecords = records as CeapsExpenseDto[];

      const uniqueCodes = new Set(ceapsRecords.map(r => String(r.codSenador)));

      // Scan for unique unknown codSenador
      const unknownCodes = [...uniqueCodes].filter(code => !senatorMap.has(code));

      for (const code of unknownCodes) {
        const result = await this.lookupService.findCpfBySenatorCode(code, this.httpClient);
        if (result) {
          this.politicianRepo.updateSourceApiId(result.cpf, code);
          senatorMap.set(code, result.cpf);
          console.log(`Matched historical senator: ${result.name} (${code}) -> ${result.cpf}`);
        } else {
          // Mark as null to avoid re-fetching the same unknown code within this execution
          senatorMap.set(code, null);
        }
      }

      const rows: ExpenseRow[] = [];
      for (const expense of ceapsRecords) {
        const senatorCpf = senatorMap.get(String(expense.codSenador));

        if (!senatorCpf) {
          if (senatorCpf === undefined) {
            console.warn(
              `Unknown senator code: ${expense.codSenador} for expense ID ${expense.id}`,
            );
          }
          continue;
        }

        const expenseId = String(expense.id);
        const tipoDespesa = normalizeLabel(expense.tipoDespesa ?? '');
        const codTipoDocumento = mapCeapsDocumentType(expense.tipoDocumento);
        const cnpjCpfFornecedor = normalizeNumericText(expense.cpfCnpj);
        const valorLiquido = Math.round(expense.valorReembolsado * 100);

        rows.push({
          id: expenseId,
          politicianId: senatorCpf,
          tipoDespesa,
          codDocumento: expenseId,
          codTipoDocumento,
          dataDocumento: expense.data,
          numDocumento: expense.documento ?? null,
          urlDocumento: null,
          nomeFornecedor: expense.fornecedor,
          cnpjCpfFornecedor,
          valorLiquido,
          valorGlosa: 0,
        });
      }

      if (rows.length > 0) {
        this.expensesRepo.insertBatch(rows);
        console.log(`Inserted ${rows.length} CEAPS expenses for year ${year}`);
      }
    } catch (error) {
      const message = `Failed to fetch CEAPS expenses for year ${year}`;
      console.error(`${message}:`, error);
      throw new Error(`${message}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
