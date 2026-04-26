import type Database from 'better-sqlite3';
import { FileDownloader } from '../../core/FileDownloader';
import { PoliticianRepository } from '../../repositories/PoliticianRepository';
import { PoliticianRole } from '../../types/PoliticianRole';
import { TSECargo } from '../../types/TSECargo';
import { TSEElectionResultStatus } from '../../types/TSEElectionResultStatus';
import { normalizeCPF, isValidCPF } from '../../util/cpf.util';
import { normalizeId } from '../../util/normalization.util';
import { parse } from 'csv-parse/sync';
import { readFileSync, readdirSync, unlinkSync, rmdirSync } from 'fs';
import { join } from 'path';

interface TSECandidate {
  DS_CARGO: string;
  NR_CPF_CANDIDATO: string;
  NM_URNA_CANDIDATO: string;
  SG_UF: string;
  SG_PARTIDO: string;
  DS_SIT_TOT_TURNO: string;
}

export class TSE2022ElectionResultsPipeline {
  private readonly downloadUrl = 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2022.zip';
  private readonly tempDir = join(process.cwd(), 'temp_tse_2022');
  private readonly zipPath = join(this.tempDir, 'consulta_cand_2022.zip');
  private readonly extractPath = join(this.tempDir, 'extracted');
  private readonly downloader = new FileDownloader();
  private readonly repo: PoliticianRepository;

  constructor(db: Database.Database) {
    this.repo = new PoliticianRepository(db);
  }

  async execute(_forceDownload = false): Promise<void> {
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
      
      const elected = this.filterElected(allCandidates);
      console.log(`Filtered ${elected.length} elected politicians`);
      
      this.storePoliticians(elected);
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
    });
    return records;
  }

  private filterElected(candidates: TSECandidate[]): TSECandidate[] {
    const validCargos = [TSECargo.DEPUTADO_FEDERAL, TSECargo.SENADOR];
    const validStatuses = [
      TSEElectionResultStatus.ELEITO_POR_QP,
      TSEElectionResultStatus.ELEITO_POR_MEDIA,
      TSEElectionResultStatus.SUPLENTE,
    ];

    return candidates.filter(
      c => validCargos.includes(c.DS_CARGO as TSECargo) &&
           validStatuses.includes(c.DS_SIT_TOT_TURNO as TSEElectionResultStatus)
    );
  }

  private storePoliticians(candidates: TSECandidate[]): void {
    const rows = candidates
      .filter(c => isValidCPF(c.NR_CPF_CANDIDATO))
      .map(c => ({
        cpf: normalizeCPF(c.NR_CPF_CANDIDATO),
        sourceApiId: null,
        name: c.NM_URNA_CANDIDATO,
        uf: c.SG_UF,
        partyId: normalizeId(c.SG_PARTIDO),
        role: c.DS_CARGO === TSECargo.DEPUTADO_FEDERAL ? PoliticianRole.DEPUTY : PoliticianRole.SENATOR,
        photoUrl: null,
        electedAs: TSEElectionResultStatus.fromValue(c.DS_SIT_TOT_TURNO),
      }));
    
    this.repo.insertBatch(rows);
  }

  private cleanup(): void {
    try {
      const files = readdirSync(this.extractPath);
      files.forEach(f => unlinkSync(join(this.extractPath, f)));
      rmdirSync(this.extractPath);
      unlinkSync(this.zipPath);
      rmdirSync(this.tempDir);
      console.log('Cleaned up temporary files');
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }
  }
}
