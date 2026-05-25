export const vendorCompaniesCache = {
  name: 'vendor_companies_cache',
  createSql: `
    CREATE TABLE IF NOT EXISTS vendor_companies_cache (
      cnpj_basic TEXT PRIMARY KEY,
      legal_name TEXT NOT NULL,
      company_size TEXT NOT NULL
    )
  `,
  dropSql: `DROP TABLE IF EXISTS vendor_companies_cache`,
};
