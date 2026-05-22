import { Database } from 'better-sqlite3';

export interface Vendor {
  cnpj: string;
  razao_social: string;
  cnae_principal?: string;
  uf?: string;
  municipio?: string;
  data_abertura?: string;
  situacao_cadastral?: string;
  data_situacao_cadastral?: string;
  porte?: string;
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
        cnpj, razao_social, cnae_principal, uf, municipio,
        data_abertura, situacao_cadastral, data_situacao_cadastral, porte
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      for (const vendor of vendors) {
        stmt.run(
          vendor.cnpj,
          vendor.razao_social,
          vendor.cnae_principal || null,
          vendor.uf || null,
          vendor.municipio || null,
          vendor.data_abertura || null,
          vendor.situacao_cadastral || null,
          vendor.data_situacao_cadastral || null,
          vendor.porte || null
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
