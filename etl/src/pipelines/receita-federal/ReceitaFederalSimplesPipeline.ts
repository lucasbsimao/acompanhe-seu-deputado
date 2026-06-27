// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';
import { existsSync, createReadStream, unlinkSync } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse';
import { FileDownloader } from '../../core/FileDownloader';
import { HttpClient } from '../../core/HttpClient';
import { VendorRepository } from '../../repositories/VendorRepository';
import { ExpensesRepository } from '../../repositories/ExpensesRepository';
import { ReceitaFederalCNPJPipeline } from './ReceitaFederalCNPJPipeline';
import type { IPipelineDepChain } from '../../types/Pipeline';
import defaultConfig from '../../config/defaults.json';

interface SimplesRow {
  CNPJ_BASICO: string;
  OPCAO_PELO_MEI: string;
}

const SIMPLES_COLUMNS = [
  'CNPJ_BASICO',
  'OPCAO_PELO_SIMPLES',
  'DATA_DE_OPCAO_PELO_SIMPLES',
  'DATA_DE_EXCLUSAO_DO_SIMPLES',
  'OPCAO_PELO_MEI',
  'DATA_DE_OPCAO_PELO_MEI',
  'DATA_DE_EXCLUSAO_DO_MEI',
];

/**
 * Downloads and processes the Receita Federal SIMPLES file to identify MEI vendors.
 * MEI vendors are assigned an employee_count of 0 as a forensic signal.
 */
export class ReceitaFederalSimplesPipeline {
  static readonly dependencies: readonly IPipelineDepChain[] = [ReceitaFederalCNPJPipeline];

  private readonly tempDir = join(process.cwd(), 'temp_receita_federal');
  private readonly downloader: FileDownloader;
  private readonly repo: VendorRepository;
  private readonly expensesRepo: ExpensesRepository;

  private readonly webdavBase: string;
  private readonly shareToken: string;
  private readonly referenceYearMonth: string;
  private readonly simplesFileName: string;
  private readonly auth: { username: string; password: string };

  constructor(db: Database.Database) {
    this.repo = new VendorRepository(db);
    this.expensesRepo = new ExpensesRepository(db);
    this.webdavBase = defaultConfig.receitaFederal.webdavBase;
    this.shareToken = defaultConfig.receitaFederal.shareToken;
    this.referenceYearMonth = defaultConfig.receitaFederal.referenceYearMonth;
    this.simplesFileName = (defaultConfig.receitaFederal as any).simplesFileName || 'Simples.zip';
    this.auth = { username: this.shareToken, password: '' };

    const httpClient = new HttpClient(
      { maxRetries: 3, retryWaitMin: 250, retryWaitMax: 2000 },
      60000,
    );
    this.downloader = new FileDownloader(httpClient);
  }

  async execute(): Promise<void> {
    const knownCnpjs = this.expensesRepo.getDistinctCnpjs();
    if (knownCnpjs.length === 0) {
      console.log('ReceitaFederalSimplesPipeline: No CNPJs found in expenses. Skipping.');
      return;
    }

    const knownBasicCnpjs = new Set<string>(knownCnpjs.map(cnpj => cnpj.slice(0, 8)));
    console.log(
      `ReceitaFederalSimplesPipeline: Processing SIMPLES for ${knownBasicCnpjs.size} basic CNPJs`,
    );

    const zipPath = join(this.tempDir, this.simplesFileName);
    const extractPath = join(this.tempDir, 'Simples');
    const url = `${this.webdavBase}/${this.referenceYearMonth}/${this.simplesFileName}`;

    console.log(`Downloading ${url}`);
    try {
      await this.downloader.downloadFile(url, zipPath, this.auth);
      this.downloader.extractZip(zipPath, extractPath);

      const csvFiles = this.downloader.listFiles(extractPath);
      for (const csvFile of csvFiles) {
        await this.processSimplesCsv(csvFile, knownBasicCnpjs);
      }
    } finally {
      this.downloader.cleanupDir(extractPath);
      if (existsSync(zipPath)) {
        unlinkSync(zipPath);
      }
    }

    console.log('ReceitaFederalSimplesPipeline: completed.');
  }

  private async processSimplesCsv(csvFile: string, knownBasicCnpjs: Set<string>): Promise<void> {
    const parser = createReadStream(csvFile, { encoding: 'latin1' }).pipe(
      parse({
        columns: SIMPLES_COLUMNS,
        delimiter: ';',
        skip_empty_lines: true,
        relax_quotes: true,
      }),
    );

    const BATCH_SIZE = 100;
    const meiRows: { cnpjBasic: string }[] = [];
    let totalMeis = 0;

    for await (const row of parser as AsyncIterable<SimplesRow>) {
      if (knownBasicCnpjs.has(row.CNPJ_BASICO) && row.OPCAO_PELO_MEI === 'S') {
        meiRows.push({ cnpjBasic: row.CNPJ_BASICO });

        if (meiRows.length >= BATCH_SIZE) {
          this.repo.updateEmployeeCountByBasicCnpjBatch(meiRows);
          totalMeis += meiRows.length;
          meiRows.length = 0;
        }
      }
    }

    if (meiRows.length > 0) {
      this.repo.updateEmployeeCountByBasicCnpjBatch(meiRows);
      totalMeis += meiRows.length;
    }

    if (totalMeis > 0) {
      console.log(`Updated ${totalMeis} MEI vendors from ${csvFile}`);
    }
  }
}
