// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';
import { FileDownloader } from '../../core/FileDownloader';
import { HttpClient } from '../../core/HttpClient';
import {
  TseDonationsRepository,
  type TseDonationRow,
} from '../../repositories/TseDonationsRepository';
import { TseCandidatesRepository } from '../../repositories/TseCandidatesRepository';
import { TSE2022ElectionResultsPipeline } from './TSE2022ElectionResultsPipeline';
import type { IPipelineDepChain } from '../../types/Pipeline';
import { parse } from 'csv-parse';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import defaultConfig from '../../config/defaults.json';

/**
 * TSE Campaign Donations Pipeline
 *
 * Collects and stores campaign donation records for politicians across
 * multiple election years.
 *
 * Source: TSE Open Data ZIP files (prestacao_de_contas_eleitorais_candidatos_{year}.zip).
 *
 * Key behaviour: Downloads ZIPs for configured years, filters records by candidate CPF
 * already present in the database, and normalizes currency values to integer centavos.
 *
 * Co-dependencies: Depends on {@link TSE2022ElectionResultsPipeline} to ensure
 * candidate CPFs are available for filtering.
 */
export class TSECampaignDonationsPipeline {
  static readonly dependencies: readonly IPipelineDepChain[] = [TSE2022ElectionResultsPipeline];

  private readonly tempDir = join(process.cwd(), 'temp_tse_donations');
  private readonly downloader: FileDownloader;
  private readonly donationsRepo: TseDonationsRepository;
  private readonly candidatesRepo: TseCandidatesRepository;

  constructor(db: Database.Database) {
    this.donationsRepo = new TseDonationsRepository(db);
    this.candidatesRepo = new TseCandidatesRepository(db);
    const httpClient = new HttpClient(
      { maxRetries: 3, retryWaitMin: 250, retryWaitMax: 2000 },
      120000, // Large ZIPs need longer timeout
    );
    this.downloader = new FileDownloader(httpClient);
  }

  async shouldDownload(): Promise<boolean> {
    return this.donationsRepo.count() === 0;
  }

  async execute(forceDownload = false): Promise<void> {
    if (!forceDownload && !(await this.shouldDownload())) {
      console.log('TSE Donations data already exists, skipping. Use --force-download to override.');
      return;
    }

    const years = defaultConfig.tseDonations.electionYears;
    console.log('Starting TSE Campaign Donations Pipeline for years: %s...', years.join(', '));

    for (const year of years) {
      await this.processYear(year);
    }
  }

  private async processYear(year: number): Promise<void> {
    const downloadUrl = `https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_${year}.zip`;
    const yearTempDir = join(this.tempDir, year.toString());
    const zipPath = join(yearTempDir, `donations_${year}.zip`);
    const extractPath = join(yearTempDir, 'extracted');
    const targetFileName = `receitas_candidatos_${year}_BRASIL.csv`;

    try {
      console.log('Downloading donations for %d...', year);
      await this.downloader.downloadFile(downloadUrl, zipPath);

      console.log('Extracting %s...', targetFileName);
      this.downloader.extractZip(zipPath, extractPath);

      const filePath = join(extractPath, targetFileName);
      if (!existsSync(filePath)) {
        throw new Error(`Target file ${targetFileName} not found in ZIP`);
      }

      console.log('Parsing and filtering donations for %d...', year);
      await this.processCSV(filePath, year);

      console.log('Successfully processed donations for %d', year);
    } finally {
      this.downloader.cleanupDir(yearTempDir);
    }
  }

  private async processCSV(filePath: string, year: number): Promise<void> {
    const candidateCpfs = this.candidatesRepo.getAllCpfs();
    console.log('Filtering for %d candidates in tse_candidates', candidateCpfs.size);

    const parser = createReadStream(filePath, { encoding: 'latin1' }).pipe(
      parse({
        columns: true,
        delimiter: ';',
        skip_empty_lines: true,
        relax_quotes: true,
        trim: true,
      }),
    );

    let batch: TseDonationRow[] = [];
    const BATCH_SIZE = 1000;
    let totalCount = 0;
    let filteredCount = 0;

    for await (const record of parser) {
      totalCount++;
      const recipientCpf = record.NR_CPF_CANDIDATO;

      if (candidateCpfs.has(recipientCpf)) {
        const donorCpf = record.NR_CPF_CNPJ_DOADOR;
        const valorStr = record.VR_RECEITA;

        // Parse "1.234,56" or "1234,56" to integer centavos
        const valorNormalized = valorStr.replace(/\./g, '').replace(',', '.');
        const valorCentavos = Math.round(parseFloat(valorNormalized) * 100);

        if (!isNaN(valorCentavos)) {
          batch.push({
            donor_cpf: donorCpf,
            recipient_cpf: recipientCpf,
            ano_eleicao: year,
            valor: valorCentavos,
          });
          filteredCount++;
        }
      }

      if (batch.length >= BATCH_SIZE) {
        this.donationsRepo.insertBatch(batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      this.donationsRepo.insertBatch(batch);
    }

    console.log(
      'Processed %d rows, kept %d donations for target candidates.',
      totalCount,
      filteredCount,
    );
  }
}
