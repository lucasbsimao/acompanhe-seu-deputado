import type Database from 'better-sqlite3';

export class TestVendorRepository {
  constructor(private readonly db: Database.Database) {}

  seedVendor(cnpj: string, openingDate: string | null): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO vendors (cnpj, legal_name, primary_cnae, uf, municipio, opening_date,
          registration_status, registration_status_date, company_size)
         VALUES (?, 'Vendor LTDA', NULL, NULL, NULL, ?, NULL, NULL, NULL)`,
      )
      .run(cnpj, openingDate);
  }

  seedMinimalVendor(cnpj: string, legalName: string = 'Vendor LTDA'): void {
    this.db.prepare(`INSERT INTO vendors (cnpj, legal_name) VALUES (?, ?)`).run(cnpj, legalName);
  }

  seedVendorWithStatus(
    cnpj: string,
    registrationStatus: string | null,
    registrationStatusDate: string | null,
  ): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO vendors (cnpj, legal_name, primary_cnae, uf, municipio, opening_date,
          registration_status, registration_status_date, company_size)
         VALUES (?, 'Vendor LTDA', NULL, NULL, NULL, NULL, ?, ?, NULL)`,
      )
      .run(cnpj, registrationStatus, registrationStatusDate);
  }
}
