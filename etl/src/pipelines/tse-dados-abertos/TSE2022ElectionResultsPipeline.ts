// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';
import { FileDownloader } from '../../core/FileDownloader';
import { HttpClient } from '../../core/HttpClient';
import { PoliticianRepository } from '../../repositories/PoliticianRepository';
import { ElectedPoliticiansStep } from './steps/ElectedPoliticiansStep';
import { AllCargoCandidatesStep } from './steps/AllCargoCandidatesStep';
import type { TSECandidate } from '../../types/TSECandidate';
import { PoliticianRole } from '../../types/PoliticianRole';
import { join } from 'path';
import { parseCSVFile } from './tseUtils';
import type { IPipelineDepChain } from '../../types/Pipeline';

/**
 * TSE 2022 Election Results Pipeline
 *
 * Collects and stores federal deputy and senator candidates elected in the
 * 2022 general election.
 *
 * Source: TSE Open Data ZIP file (consulta_cand_2022.zip).
 *
 * Key behaviour: Downloads and extracts the full candidate ZIP, parses records,
 * and uses shared steps to populate both the politicians and tse_candidates tables.
 *
 * Co-dependencies: Declares no dependencies as it is the base pipeline for
 * election results.
 */
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

      const csvFiles = this.downloader.listFiles(this.extractPath, 'consulta_cand_2022_');
      console.log(`Found ${csvFiles.length} CSV files`);

      const allCandidates: TSECandidate[] = [];
      for (const file of csvFiles) {
        const candidates = parseCSVFile(file);
        allCandidates.push(...candidates);
      }

      console.log(`Processing ${allCandidates.length} candidates`);
      this.electedStep.run(allCandidates);
      this.allCandidatesStep.run(allCandidates);
      console.log('TSE 2022 data stored successfully');
    } finally {
      this.downloader.cleanupDir(this.tempDir);
    }
  }
}
