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
import { logger } from '../../util/logger';

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
  ano: number;
  mes: number;
}

/**
 * Senators Expenses Pipeline
 *
 * Fetches CEAPS (Cota para Exercício da Atividade Parlamentar dos Senadores)
 * expenses from the Senado Open Data API.
 *
 * Source: Senado Open Data API (despesas_ceaps/{year}).
 *
 * Key behaviour: Matches expenses to politicians using the parliamentary code
 * (codSenador). If a code is not found in the database, it attempts to resolve
 * it via {@link PoliticianLookupService}.
 *
 * Note on historical data: If a senator code remains unknown, it is logged as a
 * warning. This typically happens for former senators whose data is not present
 * in the current TSE election results seeded by TSE pipelines. If the intention
 * is to process historical data, make sure you create new TSE pipelines for the
 * historical years to seed the database properly.
 */
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
      logger.info({ year }, 'skipping CEAPS expenses: already exists');
      return;
    }

    logger.info({ year }, 'fetching CEAPS expenses');
    const url = `https://adm.senado.gov.br/adm-dadosabertos/api/v1/senadores/despesas_ceaps/${year}`;

    try {
      const response = await this.httpClient.request(url);
      const records = response.data;

      if (!Array.isArray(records)) {
        throw new Error(`Expected array of expenses, got ${typeof records}`);
      }

      const ceapsRecords = records as CeapsExpenseDto[];
      const uniqueCodes = new Set(ceapsRecords.map(r => String(r.codSenador)));

      const newSenatorMappings = await this.resolveUnknownSenators(uniqueCodes, senatorMap);
      for (const [code, cpf] of newSenatorMappings) {
        senatorMap.set(code, cpf);
      }

      const rows = this.mapToExpenseRows(ceapsRecords, senatorMap);

      if (rows.length > 0) {
        this.expensesRepo.insertBatch(rows);
        logger.info({ year, rowsInserted: rows.length }, 'CEAPS expenses inserted');
      }
    } catch (error) {
      const message = `Failed to fetch CEAPS expenses for year ${year}`;
      logger.error({ year, err: error }, 'failed to fetch CEAPS expenses');
      throw new Error(`${message}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async resolveUnknownSenators(
    codes: Set<string>,
    currentMap: Map<string, string | null>,
  ): Promise<Map<string, string | null>> {
    const newMappings = new Map<string, string | null>();
    const unknownCodes = [...codes].filter(code => !currentMap.has(code));

    for (const code of unknownCodes) {
      const result = await this.lookupService.findCpfBySenatorCode(code, this.httpClient);
      if (result) {
        this.politicianRepo.updateSourceApiId(result.cpf, code);
        newMappings.set(code, result.cpf);
        logger.info(
          { senatorCode: code, name: result.name, cpf: result.cpf },
          'historical senator matched',
        );
      } else {
        newMappings.set(code, null);
      }
    }

    return newMappings;
  }

  private mapToExpenseRows(
    records: CeapsExpenseDto[],
    senatorMap: Map<string, string | null>,
  ): ExpenseRow[] {
    const rows: ExpenseRow[] = [];
    for (const expense of records) {
      const senatorCpf = senatorMap.get(String(expense.codSenador));

      if (!senatorCpf) {
        if (senatorCpf === null) {
          logger.warn(
            { senatorCode: expense.codSenador, expenseId: expense.id },
            'unknown senator code: possibly missing historical TSE data',
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
        competencyYear: expense.ano,
        competencyMonth: expense.mes,
      });
    }
    return rows;
  }
}
