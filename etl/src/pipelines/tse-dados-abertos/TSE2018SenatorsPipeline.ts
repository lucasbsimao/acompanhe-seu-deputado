// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';
import { FileDownloader } from '../../core/FileDownloader';
import { HttpClient } from '../../core/HttpClient';
import { ElectedPoliticiansStep } from './steps/ElectedPoliticiansStep';
import { AllCargoCandidatesStep } from './steps/AllCargoCandidatesStep';
import type { TSECandidate } from '../../types/TSECandidate';
import { TSECargo } from '../../types/TSECargo';
import { TseCandidatesRepository } from '../../repositories/TseCandidatesRepository';
import { join } from 'path';
import { parseCSVFile } from './tseUtils';
import type { IPipelineDepChain } from '../../types/Pipeline';
import { TSE2022ElectionResultsPipeline } from './TSE2022ElectionResultsPipeline';
import { logger } from '../../util/logger';

/**
 * TSE 2018 Senators Pipeline
 *
 * Collects and stores senator candidates elected in the 2018 rotation to ensure
 * the database has the full cohort of 81 senators (together with 2022 results).
 *
 * Source: TSE Open Data ZIP file (consulta_cand_2018.zip).
 *
 * Key behaviour: Downloads and extracts the full candidate ZIP, filters records
 * specifically for the {@link TSECargo.SENADOR} cargo, and uses shared steps to populate
 * both the politicians and tse_candidates tables.
 *
 * Co-dependencies: Depends on {@link TSE2022ElectionResultsPipeline} to ensure
 * the 2022 cohort is processed in the correct sequence.
 */
export class TSE2018SenatorsPipeline {
  static readonly dependencies: readonly IPipelineDepChain[] = [TSE2022ElectionResultsPipeline];

  private readonly downloadUrl =
    'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2018.zip';
  private readonly tempDir = join(process.cwd(), 'temp_tse_2018');
  private readonly zipPath = join(this.tempDir, 'consulta_cand_2018.zip');
  private readonly extractPath = join(this.tempDir, 'extracted');
  private readonly downloader: FileDownloader;
  private readonly candidatesRepo: TseCandidatesRepository;
  private readonly electedStep: ElectedPoliticiansStep;
  private readonly allCandidatesStep: AllCargoCandidatesStep;

  constructor(db: Database.Database) {
    this.candidatesRepo = new TseCandidatesRepository(db);
    this.electedStep = new ElectedPoliticiansStep(db);
    this.allCandidatesStep = new AllCargoCandidatesStep(db);
    const httpClient = new HttpClient(
      { maxRetries: 3, retryWaitMin: 250, retryWaitMax: 2000 },
      60000,
    );
    this.downloader = new FileDownloader(httpClient);
  }

  shouldDownload(): Promise<boolean> {
    return Promise.resolve(this.candidatesRepo.countByCargoAndYear(TSECargo.SENADOR, '2018') === 0);
  }

  async execute(forceDownload = false): Promise<void> {
    if (!forceDownload && !(await this.shouldDownload())) {
      logger.info('senators data already exists, skipping download');
      return;
    }

    try {
      logger.info('starting TSE 2018 senators pipeline');

      await this.downloader.downloadFile(this.downloadUrl, this.zipPath);
      this.downloader.extractZip(this.zipPath, this.extractPath);

      const csvFiles = this.downloader.listFiles(this.extractPath, 'consulta_cand_2018_');
      logger.info({ csvFileCount: csvFiles.length }, 'CSV files found');

      const allCandidates: TSECandidate[] = [];
      for (const file of csvFiles) {
        const candidates = parseCSVFile(file);
        allCandidates.push(...candidates);
      }

      const senatorCargos = [
        TSECargo.SENADOR,
        TSECargo.SUPLENTE_1,
        TSECargo.SUPLENTE_2,
      ] as string[];
      const senators = allCandidates.filter(c => senatorCargos.includes(c.DS_CARGO));
      logger.info({ candidateCount: senators.length }, 'processing senators');

      this.electedStep.run(senators);
      this.allCandidatesStep.run(senators);
      logger.info('senators stored successfully');
    } finally {
      this.downloader.cleanupDir(this.tempDir);
    }
  }
}
