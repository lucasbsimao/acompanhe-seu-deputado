// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';
import { existsSync, createReadStream, unlinkSync } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse';
import { FileDownloader } from '../../core/FileDownloader';
import { HttpClient } from '../../core/HttpClient';
import {
  VendorRepository,
  type Vendor,
  type VendorPartner,
} from '../../repositories/VendorRepository';
import { ExpensesRepository } from '../../repositories/ExpensesRepository';
import {
  VendorEmpresasCacheRepository,
  type VendorEmpresaCacheRow,
} from '../../repositories/VendorEmpresasCacheRepository';
import { ExpensesPipeline } from '../dados-abertos-camara/ExpensesPipeline';
import type { IPipelineDepChain } from '../../types/Pipeline';
import defaultConfig from '../../config/defaults.json';
import { logger } from '../../util/logger';

enum FileType {
  ESTABLISHMENTS = 'Estabelecimentos',
  COMPANIES = 'Empresas',
  PARTNERS = 'Socios',
}

interface EstabelecimentoRow {
  CNPJ_BASICO: string;
  CNPJ_ORDEM: string;
  CNPJ_DV: string;
  CNAE_FISCAL_PRINCIPAL: string;
  UF: string;
  MUNICIPIO: string;
  DATA_INICIO_ATIVIDADE: string;
  SITUACAO_CADASTRAL: string;
  DATA_SITUACAO_CADASTRAL: string;
}

interface EmpresaRow {
  CNPJ_BASICO: string;
  RAZAO_SOCIAL: string;
  PORTE_EMPRESA: string;
}

interface SocioRow {
  CNPJ_BASICO: string;
  NOME_SOCIO: string;
  CNPJ_CPF_DO_SOCIO: string;
  QUALIFICACAO_SOCIO: string;
}

const ESTABELECIMENTOS_COLUMNS = [
  'CNPJ_BASICO',
  'CNPJ_ORDEM',
  'CNPJ_DV',
  'TIPO_ESTABELECIMENTO',
  'NOME_FANTASIA',
  'SITUACAO_CADASTRAL',
  'DATA_SITUACAO_CADASTRAL',
  'MOTIVO_SITUACAO_CADASTRAL',
  'NOME_CIDADE_EXTERIOR',
  'PAIS',
  'DATA_INICIO_ATIVIDADE',
  'CNAE_FISCAL_PRINCIPAL',
  'CNAE_FISCAL_SECUNDARIA',
  'TIPO_LOGRADOURO',
  'LOGRADOURO',
  'NUMERO',
  'COMPLEMENTO',
  'BAIRRO',
  'CEP',
  'UF',
  'MUNICIPIO',
  'DDD_1',
  'TELEFONE_1',
  'DDD_2',
  'TELEFONE_2',
  'DDD_FAX',
  'FAX',
  'CORREIO_ELETRONICO',
  'SITUACAO_ESPECIAL',
  'DATA_SITUACAO_ESPECIAL',
];

const EMPRESAS_COLUMNS = [
  'CNPJ_BASICO',
  'RAZAO_SOCIAL',
  'NATUREZA_JURIDICA',
  'QUALIFICACAO_DO_RESPONSAVEL',
  'CAPITAL_SOCIAL',
  'PORTE_EMPRESA',
  'ENTE_FEDERATIVO_RESPONSAVEL',
];

const SOCIOS_COLUMNS = [
  'CNPJ_BASICO',
  'IDENTIFICADOR_DE_SOCIO',
  'NOME_SOCIO',
  'CNPJ_CPF_DO_SOCIO',
  'QUALIFICACAO_SOCIO',
  'DATA_ENTRADA_SOCIEDADE',
  'PAIS',
  'REPRESENTANTE_LEGAL',
  'NOME_DO_REPRESENTANTE',
  'QUALIFICACAO_REPRESENTANTE_LEGAL',
  'FAIXA_ETARIA',
];

export class ReceitaFederalCNPJPipeline {
  static readonly dependencies: readonly IPipelineDepChain[] = [ExpensesPipeline];

  private readonly tempDir = join(process.cwd(), 'temp_receita_federal');
  private readonly downloader: FileDownloader;
  private readonly repo: VendorRepository;
  private readonly expensesRepo: ExpensesRepository;
  private readonly empresasCacheRepo: VendorEmpresasCacheRepository;

  private readonly webdavBase: string;
  private readonly shareToken: string;
  private readonly fileCount: number;
  private readonly referenceYearMonth: string;
  private readonly auth: { username: string; password: string };

  constructor(db: Database.Database) {
    this.repo = new VendorRepository(db);
    this.expensesRepo = new ExpensesRepository(db);
    this.empresasCacheRepo = new VendorEmpresasCacheRepository(db);
    this.webdavBase = defaultConfig.receitaFederal.webdavBase;
    this.shareToken = defaultConfig.receitaFederal.shareToken;
    this.fileCount = defaultConfig.receitaFederal.fileCount;
    this.referenceYearMonth = defaultConfig.receitaFederal.referenceYearMonth;
    this.auth = { username: this.shareToken, password: '' };
    const httpClient = new HttpClient(
      { maxRetries: 3, retryWaitMin: 250, retryWaitMax: 2000 },
      60000,
    );
    this.downloader = new FileDownloader(httpClient);
  }

  shouldSkip(): boolean {
    return this.repo.hasAnyVendors();
  }

  async execute(forceDownload = false): Promise<void> {
    if (!forceDownload && this.shouldSkip()) {
      logger.info('vendors already populated, skipping');
      return;
    }

    const knownCnpjs = this.loadKnownCnpjs();
    if (knownCnpjs.size === 0) {
      logger.info('no CNPJs found in expenses, skipping');
      return;
    }

    const knownBasicCnpjs = new Set<string>([...knownCnpjs].map(cnpj => cnpj.slice(0, 8)));

    logger.info(
      { cnpjCount: knownCnpjs.size, basicCnpjCount: knownBasicCnpjs.size },
      'CNPJs loaded',
    );

    this.empresasCacheRepo.createTable();
    logger.debug('staging table created: vendor_companies_cache');

    try {
      // Process Companies files into staging table
      for (let i = 0; i < this.fileCount; i++) {
        await this.processFileType(FileType.COMPANIES, i, knownBasicCnpjs, knownCnpjs);
      }

      // Process Establishments files, joining against staging table
      for (let i = 0; i < this.fileCount; i++) {
        await this.processFileType(FileType.ESTABLISHMENTS, i, knownBasicCnpjs, knownCnpjs);
      }

      // Process Partners files
      for (let i = 0; i < this.fileCount; i++) {
        await this.processFileType(FileType.PARTNERS, i, knownBasicCnpjs, knownCnpjs);
      }
    } finally {
      this.empresasCacheRepo.dropTable();
      logger.debug('staging table dropped: vendor_companies_cache');
    }
  }

  private loadKnownCnpjs(): Set<string> {
    const cnpjs = this.expensesRepo.getDistinctCnpjs();
    return new Set(cnpjs);
  }

  private buildUrl(fileType: FileType, index: number): string {
    return `${this.webdavBase}/${this.referenceYearMonth}/${fileType}${index}.zip`;
  }

  private async processFileType(
    fileType: FileType,
    index: number,
    knownBasicCnpjs: Set<string>,
    knownCnpjs: Set<string>,
  ): Promise<void> {
    const zipName = `${fileType}${index}.zip`;
    const zipPath = join(this.tempDir, zipName);
    const extractPath = join(this.tempDir, `${fileType}${index}`);
    const url = this.buildUrl(fileType, index);

    logger.info({ url }, 'downloading file');
    try {
      await this.downloader.downloadFile(url, zipPath, this.auth);
      this.downloader.extractZip(zipPath, extractPath);

      const csvFiles = this.downloader.listFiles(extractPath);
      for (const csvFile of csvFiles) {
        await this.processCsvFile(fileType, csvFile, knownBasicCnpjs, knownCnpjs);
      }
    } finally {
      this.downloader.cleanupDir(extractPath);
      if (existsSync(zipPath)) {
        unlinkSync(zipPath);
      }
    }
  }

  private async processCsvFile(
    fileType: FileType,
    csvFile: string,
    knownBasicCnpjs: Set<string>,
    knownCnpjs: Set<string>,
  ): Promise<void> {
    switch (fileType) {
      case FileType.COMPANIES:
        await this.processCompaniesCsv(csvFile, knownBasicCnpjs);
        break;
      case FileType.ESTABLISHMENTS:
        await this.processEstablishmentsCsv(csvFile, knownCnpjs);
        break;
      case FileType.PARTNERS:
        await this.processPartnersCsv(csvFile, knownBasicCnpjs);
        break;
      default:
        throw new Error(`Unknown file type: ${String(fileType)}`);
    }
  }

  private async processCompaniesCsv(csvFile: string, knownBasicCnpjs: Set<string>): Promise<void> {
    const parser = createReadStream(csvFile, { encoding: 'latin1' }).pipe(
      parse({
        columns: EMPRESAS_COLUMNS,
        delimiter: ';',
        skip_empty_lines: true,
        relax_quotes: true,
      }),
    );

    const BATCH_SIZE = 50;
    const cacheRows: VendorEmpresaCacheRow[] = [];
    let totalInserted = 0;
    for await (const row of parser as AsyncIterable<EmpresaRow>) {
      if (knownBasicCnpjs.has(row.CNPJ_BASICO)) {
        cacheRows.push({
          cnpj_basic: row.CNPJ_BASICO,
          legal_name: row.RAZAO_SOCIAL.trim(),
          company_size: row.PORTE_EMPRESA.trim(),
        });
        if (cacheRows.length >= BATCH_SIZE) {
          this.empresasCacheRepo.insertBatch(cacheRows);
          totalInserted += cacheRows.length;
          cacheRows.length = 0;
        }
      }
    }
    if (cacheRows.length > 0) {
      this.empresasCacheRepo.insertBatch(cacheRows);
      totalInserted += cacheRows.length;
      cacheRows.length = 0;
    }
    logger.info({ csvFile, rowsInserted: totalInserted }, 'company records inserted');
  }

  private async processEstablishmentsCsv(csvFile: string, knownCnpjs: Set<string>): Promise<void> {
    const parser = createReadStream(csvFile, { encoding: 'latin1' }).pipe(
      parse({
        columns: ESTABELECIMENTOS_COLUMNS,
        delimiter: ';',
        skip_empty_lines: true,
        relax_quotes: true,
      }),
    );

    const BATCH_SIZE = 50;
    const vendors: Vendor[] = [];
    let totalVendors = 0;
    for await (const row of parser as AsyncIterable<EstabelecimentoRow>) {
      const cnpj = `${row.CNPJ_BASICO}${row.CNPJ_ORDEM}${row.CNPJ_DV}`;
      if (!knownCnpjs.has(cnpj)) continue;

      const empresa = this.empresasCacheRepo.findByBasicCnpj(row.CNPJ_BASICO);

      vendors.push({
        cnpj,
        legal_name: empresa?.legal_name ?? '',
        primary_cnae: row.CNAE_FISCAL_PRINCIPAL.trim() || undefined,
        uf: row.UF.trim() || undefined,
        municipio: row.MUNICIPIO.trim() || undefined,
        opening_date: row.DATA_INICIO_ATIVIDADE.trim() || undefined,
        registration_status: row.SITUACAO_CADASTRAL.trim() || undefined,
        registration_status_date: row.DATA_SITUACAO_CADASTRAL.trim() || undefined,
        company_size: empresa?.company_size ?? undefined,
      });

      if (vendors.length >= BATCH_SIZE) {
        this.repo.insertVendorBatch(vendors);
        totalVendors += vendors.length;
        vendors.length = 0;
      }
    }
    if (vendors.length > 0) {
      this.repo.insertVendorBatch(vendors);
      totalVendors += vendors.length;
      vendors.length = 0;
    }

    if (totalVendors > 0) {
      logger.info({ csvFile, rowsInserted: totalVendors }, 'vendors inserted');
    }
  }

  private async processPartnersCsv(csvFile: string, knownBasicCnpjs: Set<string>): Promise<void> {
    const parser = createReadStream(csvFile, { encoding: 'latin1' }).pipe(
      parse({
        columns: SOCIOS_COLUMNS,
        delimiter: ';',
        skip_empty_lines: true,
        relax_quotes: true,
      }),
    );

    const BATCH_SIZE = 50;
    const partners: VendorPartner[] = [];
    let totalPartners = 0;
    for await (const row of parser as AsyncIterable<SocioRow>) {
      if (!knownBasicCnpjs.has(row.CNPJ_BASICO)) continue;

      const partnerCpfCnpj = row.CNPJ_CPF_DO_SOCIO.trim();
      if (!partnerCpfCnpj) continue;

      if (partnerCpfCnpj.length === 14 && !knownBasicCnpjs.has(partnerCpfCnpj.slice(0, 8))) {
        continue;
      }

      const fullCnpjs = this.repo.getFullCnpjsByBasicCnpj(row.CNPJ_BASICO);
      for (const fullCnpj of fullCnpjs) {
        partners.push({
          cnpj: fullCnpj,
          partner_cpf_cnpj: partnerCpfCnpj,
          partner_name: row.NOME_SOCIO.trim(),
          partner_role: row.QUALIFICACAO_SOCIO.trim() || undefined,
        });
      }

      if (partners.length >= BATCH_SIZE) {
        this.repo.insertPartnersBatch(partners);
        totalPartners += partners.length;
        partners.length = 0;
      }
    }
    if (partners.length > 0) {
      this.repo.insertPartnersBatch(partners);
      totalPartners += partners.length;
      partners.length = 0;
    }

    if (totalPartners > 0) {
      logger.info({ csvFile, rowsInserted: totalPartners }, 'vendor partners inserted');
    }
  }
}
