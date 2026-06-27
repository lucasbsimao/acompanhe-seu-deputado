// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';
import { parse } from 'node-html-parser';
import { HttpClient } from '../../core/HttpClient';
import { PoliticianRepository } from '../../repositories/PoliticianRepository';
import { ExpensesRepository, type CeapsWorkQueueItem } from '../../repositories/ExpensesRepository';
import { SenatorsExpensesPipeline } from './SenatorsExpensesPipeline';
import type { IPipelineDepChain } from '../../types/Pipeline';
import { mapToCeapsPortalCategory } from '../../mappers/CeapsPortalCategory.mapper';
import { normalizeNumericText } from '../../util/normalization.util';
import defaultConfig from '../../config/defaults.json';

/**
 * Enriches senator CEAPS expenses with document URLs scraped from the Senate transparency portal.
 *
 * Source: `www6g.senado.leg.br/transparencia/sen/<codSenador>/ceaps/<categoryId>/detalhe/`
 * Depends on: {@link SenatorsExpensesPipeline} (expenses must exist before URLs can be attached).
 *
 * Key behaviour:
 * - Groups expenses by senator and processes each senator's work sequentially within a
 *   parallel batch of up to 20 senators, to respect portal rate limits.
 * - Each portal page covers one (senator, CEAPS category, month/year) tuple. Rows are
 *   matched to DB records by the composite key (CPF, CNPJ, date, amount in cents).
 * - `tipoDespesa` is required to resolve the portal category ID. Expenses where the
 *   Senate open-data API returned `null` for this field are stored with an empty string
 *   and silently skipped: empirical testing confirmed that these records (all `Recibo`
 *   type, no document number) do not appear on the portal under any CEAPS category and
 *   therefore cannot be enriched. The count of skipped expenses is logged as a warning
 *   at the start of each run.
 */
export class SenatorsDocUrlRetrievalPipeline {
  static readonly dependencies: readonly IPipelineDepChain[] = [SenatorsExpensesPipeline];

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
    const workQueue = this.expensesRepo.getCeapsWorkQueue(forceDownload);
    if (workQueue.length === 0) {
      console.log('[CeapsDocumentUrlPipeline] No expenses found for enrichment.');
      return;
    }

    const unclassifiedCount = this.expensesRepo.countUnclassifiedSenatorExpenses();
    if (unclassifiedCount > 0) {
      console.warn(
        `[CeapsDocumentUrlPipeline] Skipping ${unclassifiedCount} senator expense(s) with no tipoDespesa — the Senate open-data API returned null for these records and the transparency portal does not expose them under any CEAPS category.`,
      );
    }

    console.log(
      `[CeapsDocumentUrlPipeline] Starting enrichment for ${workQueue.length} (senator, category, month/year) groups...`,
    );

    const senatorCodeToCpfMap = this.politicianRepo.getSenatorCodeToCpfMap();

    // Group work by senator to ensure sequential processing within a senator's lane
    const workBySenator = new Map<string, CeapsWorkQueueItem[]>();
    for (const item of workQueue) {
      const list = workBySenator.get(item.cod_senador) || [];
      list.push(item);
      workBySenator.set(item.cod_senador, list);
    }

    const senatorCodes = Array.from(workBySenator.keys());
    const maxParallelism = 20;

    for (let i = 0; i < senatorCodes.length; i += maxParallelism) {
      const batch = senatorCodes.slice(i, i + maxParallelism);
      await Promise.all(
        batch.map(async codSenador => {
          const items = workBySenator.get(codSenador)!;
          for (const item of items) {
            await this.fetchAndEnrichPage(item, senatorCodeToCpfMap);
          }
        }),
      );
    }

    console.log('[CeapsDocumentUrlPipeline] Enrichment pipeline completed.');
  }

  private async fetchAndEnrichPage(
    item: CeapsWorkQueueItem,
    senatorCodeToCpfMap: Map<string, string>,
  ): Promise<void> {
    const { cod_senador: codSenador, tipo_despesa: tipoDespesa, mes_ano: mesAno } = item;
    const categoryId = mapToCeapsPortalCategory(tipoDespesa);

    if (categoryId === null) {
      return;
    }

    const senatorCpf = senatorCodeToCpfMap.get(codSenador);
    if (!senatorCpf) {
      console.warn(`[CeapsDocumentUrlPipeline] Unknown senator code ${codSenador} in work queue.`);
      return;
    }

    const url = `https://www6g.senado.leg.br/transparencia/sen/${codSenador}/ceaps/${categoryId}/detalhe/?mesAno=${encodeURIComponent(
      mesAno,
    )}`;

    try {
      // Senate transparency portal requires specific headers for SSR
      const response = await this.httpClient.request(url, {
        headers: {
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
        },
      });

      const root = parse(response.data as string);
      const rows = root.querySelectorAll('table tbody tr');

      let matchCount = 0;
      for (const row of rows) {
        const cols = row.querySelectorAll('td');
        if (cols.length < 5) continue;

        // Extracting data from columns (1-indexed based on plan: 1, 4, 5)
        const portalCnpj = normalizeNumericText(cols[0].text.trim());
        const portalDateText = cols[3].text.trim(); // Expecting DD/MM/YYYY
        const portalValorText = cols[4].text.trim(); // Expecting something like "1.234,56"

        // Convert date DD/MM/YYYY to YYYY-MM-DD
        const [day, month, year] = portalDateText.split('/');
        const isoDate = `${year}-${month}-${day}`;

        // Convert valor text to cents
        const valorCents = Math.round(
          parseFloat(portalValorText.replace(/\./g, '').replace(',', '.')) * 100,
        );

        // Find document URL
        const anchor = row.querySelector('a[href*="/transparencia/sen/download/ceaps/documento/"]');
        if (!anchor) continue;

        const href = anchor.getAttribute('href');
        if (!href) continue;

        const fullPdfUrl = `https://www6g.senado.leg.br${href}`;

        // Match to DB record
        const expenseId = this.expensesRepo.findExpenseIdByCompositeKey(
          senatorCpf,
          portalCnpj,
          isoDate,
          valorCents,
        );

        if (expenseId) {
          this.expensesRepo.updateUrlDocumento(expenseId, fullPdfUrl);
          matchCount++;
        }
      }

      if (matchCount > 0) {
        console.log(
          `[CeapsDocumentUrlPipeline] Updated ${matchCount} URLs for Senator ${codSenador}, Category ${categoryId}, Period ${mesAno}`,
        );
      }
    } catch (error) {
      console.error(
        `[CeapsDocumentUrlPipeline] Error fetching page for Senator ${codSenador}, Category ${categoryId}, Period ${mesAno}:`,
        error,
      );
    }
  }
}
