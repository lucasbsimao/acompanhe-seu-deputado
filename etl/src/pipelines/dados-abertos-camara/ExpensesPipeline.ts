// SPDX-License-Identifier: AGPL-3.0-or-later

import { BasePipeline } from './BasePipeline';
import { DeputiesPipeline } from './DeputiesPipeline';
import type { IPipelineDepChain } from '../../types/Pipeline';
import { ExpensesRepository } from '../../repositories/ExpensesRepository';
import { PoliticianRole } from '../../types/PoliticianRole';
import type Database from 'better-sqlite3';
import { normalizeNumericText, normalizeLabel } from '../../util/normalization.util';
import { convertToCents } from '../../util/convertion.util';
import defaultConfig from '../../config/defaults.json';
import { CodTipoDocumento } from '../../types/CodTipoDocumento';

interface ExpenseData {
  ano: number;
  mes: number;
  tipoDespesa: string;
  codDocumento: string;
  tipoDocumento: string;
  codTipoDocumento: CodTipoDocumento;
  dataDocumento: string;
  numDocumento: string;
  valorDocumento: number;
  urlDocumento: string;
  nomeFornecedor: string;
  cnpjCpfFornecedor: string;
  valorLiquido: number;
  valorGlosa: number;
  numRessarcimento: string;
  codLote: number;
  parcela: number;
}

interface ApiResponse {
  dados: ExpenseData[];
}

export class ExpensesPipeline extends BasePipeline<ExpenseData> {
  static readonly dependencies: readonly IPipelineDepChain[] = [DeputiesPipeline];

  private readonly apiEndpoint = 'https://dadosabertos.camara.leg.br/api/v2/deputados';
  private readonly repo: ExpensesRepository;
  private readonly db: Database.Database;
  private currentApiId: string = '';
  private currentCpf: string = '';

  constructor(db: Database.Database) {
    super({
      pageSize: 100,
      parallelism: 5,
      maxRetries: 3,
      retryWaitMin: 250,
      retryWaitMax: 2000,
    });
    this.repo = new ExpensesRepository(db);
    this.db = db;
  }

  buildUrl(page: number, pageSize: number): Promise<string> {
    const url = new URL(`${this.apiEndpoint}/${this.currentApiId}/despesas`);
    const currentYear = new Date().getFullYear();
    const years = Array.from(
      { length: defaultConfig.expenses.yearsToFetch },
      (_, i) => currentYear - i,
    ).join(',');

    url.searchParams.set('ordem', 'ASC');
    url.searchParams.set('ano', years);
    url.searchParams.set('ordenarPor', 'ano');
    url.searchParams.set('pagina', String(page));
    url.searchParams.set('itens', String(pageSize));
    return Promise.resolve(url.toString());
  }

  decodePage(data: unknown): Promise<ExpenseData[]> {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid response data');
    }

    const response = data as ApiResponse;
    if (!Array.isArray(response.dados)) {
      throw new Error('Response does not contain dados array');
    }

    return Promise.resolve(response.dados);
  }

  extractTotalCount(headers: Record<string, string>): Promise<number> {
    const totalCountHeader = headers['x-total-count'];
    if (!totalCountHeader) {
      throw new Error('Missing X-Total-Count header');
    }

    const totalCount = parseInt(totalCountHeader, 10);
    if (isNaN(totalCount)) {
      throw new Error('Invalid X-Total-Count header value');
    }

    return Promise.resolve(totalCount);
  }

  shouldDownload(): Promise<boolean> {
    return Promise.resolve(!this.repo.hasExpensesForPolitician(this.currentCpf));
  }

  onPageFetched(items: ExpenseData[]): Promise<void> {
    this.repo.insertBatch(
      items.map(e => ({
        id: `${this.currentCpf}_${e.codDocumento}`,
        politicianId: this.currentCpf,
        tipoDespesa: normalizeLabel(e.tipoDespesa),
        codDocumento: e.codDocumento,
        codTipoDocumento: e.codTipoDocumento,
        dataDocumento: e.dataDocumento,
        numDocumento: e.numDocumento,
        urlDocumento: e.urlDocumento || null,
        nomeFornecedor: e.nomeFornecedor,
        cnpjCpfFornecedor: normalizeNumericText(e.cnpjCpfFornecedor),
        valorLiquido: convertToCents(e.valorLiquido),
        valorGlosa: convertToCents(e.valorGlosa),
        competencyYear: e.ano,
        competencyMonth: e.mes,
      })),
    );
    return Promise.resolve();
  }

  async execute(forceDownload = false): Promise<void> {
    const allDeputies = this.db
      .prepare('SELECT source_api_id as apiId, cpf FROM politicians WHERE role = ?')
      .all(PoliticianRole.DEPUTY) as { apiId: string; cpf: string }[];
    const total = allDeputies.length;

    let skippedNoApiId = 0;

    for (let deputyIndex = 0; deputyIndex < allDeputies.length; deputyIndex++) {
      const deputy = allDeputies[deputyIndex];

      if (!deputy.apiId) {
        skippedNoApiId++;
        continue;
      }

      this.currentApiId = deputy.apiId;
      this.currentCpf = deputy.cpf;

      process.stdout.write('\x1B[2J\x1B[H');
      process.stdout.write(`Found ${total} deputies to process\n`);
      process.stdout.write(`Processing deputy ${deputyIndex + 1}/${total}: ${this.currentApiId}\n`);

      await super.execute(forceDownload);
    }

    process.stdout.write('\x1B[2J\x1B[H');
    console.log(`All ${total} deputies processed successfully`);
    if (skippedNoApiId > 0) {
      console.log(
        `${skippedNoApiId} deputies skipped (expenses not fetched) due to missing API ID (deputy likely did not assume office during this legislature)`,
      );
    }
  }
}
