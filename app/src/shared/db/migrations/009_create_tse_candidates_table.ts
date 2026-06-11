import type { Migration } from '../migrations';

export const migration009: Migration = {
  version: '009_create_tse_candidates_table',
  sql: `CREATE TABLE IF NOT EXISTS tse_candidates (
  cpf TEXT NOT NULL,
  nome TEXT NOT NULL,
  cargo TEXT NOT NULL,
  partido TEXT NOT NULL,
  ano_eleicao TEXT NOT NULL,
  uf TEXT NOT NULL,
  PRIMARY KEY (cpf, ano_eleicao)
);

CREATE INDEX IF NOT EXISTS idx_tse_candidates_cpf ON tse_candidates(cpf);`,
};
