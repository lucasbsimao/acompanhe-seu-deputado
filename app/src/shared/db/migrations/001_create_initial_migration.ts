import type { Migration } from '../migrations';

export const migration001: Migration = {
  version: '001_create_initial_migration',
  sql: `CREATE TABLE IF NOT EXISTS ufs (
  uf    CHAR(2) PRIMARY KEY,
  name  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS parties (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  acronym TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS politicians (
  cpf TEXT PRIMARY KEY,
  source_api_id TEXT,
  name TEXT NOT NULL,
  uf CHAR(2) NOT NULL REFERENCES ufs(uf),
  party_id TEXT REFERENCES parties(id),
  role TEXT NOT NULL CHECK (role IN ('CITY_COUNCILOR', 'DEPUTY', 'SENATOR')),
  photo_url TEXT,
  elected_as TEXT CHECK (elected_as IN ('ELEITO POR QP', 'ELEITO POR MÉDIA', 'SUPLENTE'))
);

CREATE INDEX IF NOT EXISTS idx_politicians_uf ON politicians(uf);
CREATE INDEX IF NOT EXISTS idx_politicians_role ON politicians(role);
CREATE INDEX IF NOT EXISTS idx_politicians_source_api_id ON politicians(source_api_id);

CREATE TABLE IF NOT EXISTS users (
  id    TEXT PRIMARY KEY,
  uf    CHAR(2) NOT NULL REFERENCES ufs(uf)
);

CREATE TABLE IF NOT EXISTS users_politicians_followed (
  user_id    TEXT NOT NULL REFERENCES users(id),
  politician_id    TEXT NOT NULL REFERENCES politicians(cpf),
  PRIMARY KEY (user_id, politician_id)
);

CREATE TABLE IF NOT EXISTS users_parties_followed (
  user_id       TEXT NOT NULL REFERENCES users(id),
  uf_id    TEXT NOT NULL REFERENCES ufs(uf),
  PRIMARY KEY (user_id, uf_id)
);`,
};
