// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';
import { FileDownloader } from '../../core/FileDownloader';
import { HttpClient } from '../../core/HttpClient';
import { PoliticianRepository } from '../../repositories/PoliticianRepository';
import { ElectedPoliticiansStep } from './steps/ElectedPoliticiansStep';
import { AllCargoCandidatesStep } from './steps/AllCargoCandidatesStep';
import type { TSECandidate } from '../../types/TSECandidate';
import { PoliticianRole } from '../../types/PoliticianRole';
import { parse } from 'csv-parse/sync';
import { readFileSync, readdirSync, unlinkSync, rmdirSync } from 'fs';
import { join } from 'path';
import type { IPipelineDepChain } from '../../types/Pipeline';

export class TSE2022ElectionResultsPipeline {
  static readonly dependencies: readonly IPipelineDepChain[] = [];

  private readonly downloadUrl =
    'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2022.zip';
  private readonly tempDir = join(process.cwd(), 'temp_tse_2022');
  private readonly zipPath = join(this.tempDir, 'consulta_cand_2022.zip');
  private readonly extractPath = join(this.tempDir, 'extracted');
  private readonly downloader: FileDownloader;
  private readonly repo: PoliticianRepository;
  private readonly electedStep: ElectedPoliticiansStep;
  private readonly allCandidatesStep: AllCargoCandidatesStep;

  constructor(db: Database.Database) {
    this.repo = new PoliticianRepository(db);
    this.electedStep = new ElectedPoliticiansStep(db);
    this.allCandidatesStep = new AllCargoCandidatesStep(db);
    const httpClient = new HttpClient(
      { maxRetries: 3, retryWaitMin: 250, retryWaitMax: 2000 },
      60000,
    );
    this.downloader = new FileDownloader(httpClient);
  }

  shouldDownload(): Promise<boolean> {
    return Promise.resolve(
      this.repo.countByRole(PoliticianRole.DEPUTY) === 0 &&
        this.repo.countByRole(PoliticianRole.SENATOR) === 0,
    );
  }

  async execute(forceDownload = false): Promise<void> {
    if (!forceDownload && !(await this.shouldDownload())) {
      console.log('Data already exists, skipping download. Use --force-download to override.');
      return;
    }

    try {
      console.log('Starting TSE 2022 Election Results Pipeline...');

      await this.downloader.downloadFile(this.downloadUrl, this.zipPath);
      this.downloader.extractZip(this.zipPath, this.extractPath);

      const csvFiles = this.findCSVFiles();
      console.log(`Found ${csvFiles.length} CSV files`);

      const allCandidates: TSECandidate[] = [];
      for (const file of csvFiles) {
        const candidates = this.parseCSVFile(file);
        allCandidates.push(...candidates);
      }

      console.log(`Processing ${allCandidates.length} candidates`);
      this.electedStep.run(allCandidates);
      this.allCandidatesStep.run(allCandidates);
      console.log('TSE 2022 data stored successfully');
    } finally {
      this.cleanup();
    }
  }

  private findCSVFiles(): string[] {
    const files = readdirSync(this.extractPath);
    return files
      .filter(f => f.startsWith('consulta_cand_2022_') && f.endsWith('.csv'))
      .map(f => join(this.extractPath, f));
  }

  private parseCSVFile(filePath: string): TSECandidate[] {
    const content = readFileSync(filePath, { encoding: 'latin1' });
    const records = parse(content, {
      columns: true,
      delimiter: ';',
      skip_empty_lines: true,
      relax_quotes: true,
    }) as TSECandidate[];
    return records;
  }

  private cleanup(): void {
    try {
      const files = readdirSync(this.extractPath);
      files.forEach(f => {
        unlinkSync(join(this.extractPath, f));
      });
      rmdirSync(this.extractPath);
      unlinkSync(this.zipPath);
      rmdirSync(this.tempDir);
      console.log('Cleaned up temporary files');
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }
  }
}
