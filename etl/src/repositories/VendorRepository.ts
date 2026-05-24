import { Database } from 'better-sqlite3';

export interface Vendor {
  cnpj: string;
  legal_name: string;
  primary_cnae?: string;
  uf?: string;
  municipio?: string;
  opening_date?: string;
  registration_status?: string;
  registration_status_date?: string;
  company_size?: string;
}

export interface VendorPartner {
  cnpj: string;
  partner_cpf_cnpj: string;
  partner_name: string;
  partner_role?: string;
}

export class VendorRepository {
  constructor(private db: Database) {}

  insertVendorBatch(vendors: Vendor[]): void {
    if (vendors.length === 0) return;

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO vendors (
        cnpj, legal_name, primary_cnae, uf, municipio,
        opening_date, registration_status, registration_status_date, company_size
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      for (const vendor of vendors) {
        stmt.run(
          vendor.cnpj,
          vendor.legal_name,
          vendor.primary_cnae || null,
          vendor.uf || null,
          vendor.municipio || null,
          vendor.opening_date || null,
          vendor.registration_status || null,
          vendor.registration_status_date || null,
          vendor.company_size || null
        );
      }
    });

    transaction();
  }

  insertPartnersBatch(partners: VendorPartner[]): void {
    if (partners.length === 0) return;

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO vendor_partners (
        cnpj, partner_cpf_cnpj, partner_name, partner_role
      ) VALUES (?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      for (const partner of partners) {
        stmt.run(
          partner.cnpj,
          partner.partner_cpf_cnpj,
          partner.partner_name,
          partner.partner_role || null
        );
      }
    });

    transaction();
  }
}
