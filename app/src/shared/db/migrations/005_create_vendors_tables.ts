import type { Migration } from '../migrations';

export const migration005: Migration = {
  version: '005_create_vendors_tables',
  sql: `
    -- Create vendors table
    CREATE TABLE IF NOT EXISTS vendors (
      cnpj TEXT PRIMARY KEY,
      legal_name TEXT NOT NULL,
      primary_cnae TEXT,
      uf TEXT,
      municipio TEXT,
      opening_date TEXT,
      registration_status TEXT,
      registration_status_date TEXT,
      company_size TEXT
    );

    -- Create vendor_partners table
    CREATE TABLE IF NOT EXISTS vendor_partners (
      cnpj TEXT NOT NULL,
      partner_cpf_cnpj TEXT NOT NULL,
      partner_name TEXT NOT NULL,
      partner_role TEXT,
      PRIMARY KEY (cnpj, partner_cpf_cnpj),
      FOREIGN KEY (cnpj) REFERENCES vendors(cnpj) ON DELETE CASCADE
    );

    -- Create indexes for better query performance
    CREATE INDEX IF NOT EXISTS idx_vendors_uf ON vendors(uf);
    CREATE INDEX IF NOT EXISTS idx_vendors_municipio ON vendors(municipio);
    CREATE INDEX IF NOT EXISTS idx_vendors_primary_cnae ON vendors(primary_cnae);
    CREATE INDEX IF NOT EXISTS idx_vendors_registration_status ON vendors(registration_status);
    CREATE INDEX IF NOT EXISTS idx_vendor_partners_cnpj ON vendor_partners(cnpj);
    CREATE INDEX IF NOT EXISTS idx_vendor_partners_partner_cpf_cnpj ON vendor_partners(partner_cpf_cnpj);
  `,
};
