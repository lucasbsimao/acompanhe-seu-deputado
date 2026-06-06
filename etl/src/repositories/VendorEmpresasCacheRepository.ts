import type { Database } from 'better-sqlite3';
import { vendorCompaniesCache } from '../db/staging/vendor_empresas_cache';

export interface VendorEmpresaCacheRow {
  cnpj_basic: string;
  legal_name: string;
  company_size: string;
}

export class VendorEmpresasCacheRepository {
  constructor(private db: Database) {}

  createTable(): void {
    this.db.exec(vendorCompaniesCache.createSql);
  }

  dropTable(): void {
    this.db.exec(vendorCompaniesCache.dropSql);
  }

  insertBatch(rows: VendorEmpresaCacheRow[]): void {
    if (rows.length === 0) return;

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO vendor_companies_cache (cnpj_basic, legal_name, company_size)
      VALUES (?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      for (const row of rows) {
        stmt.run(row.cnpj_basic, row.legal_name, row.company_size);
      }
    });

    transaction();
  }

  findByBasicCnpj(cnpjBasic: string): VendorEmpresaCacheRow | undefined {
    return this.db.prepare(
      'SELECT cnpj_basic, legal_name, company_size FROM vendor_companies_cache WHERE cnpj_basic = ?'
    ).get(cnpjBasic) as VendorEmpresaCacheRow | undefined;
  }
}
