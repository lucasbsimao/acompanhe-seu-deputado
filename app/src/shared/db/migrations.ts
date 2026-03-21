export type Migration = {
  version: string;
  sql: string;
};

export const migrations: Migration[] = [
  {
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
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  uf    CHAR(2) NOT NULL REFERENCES ufs(uf),
  party_id TEXT REFERENCES parties(id),
  role   TEXT NOT NULL CHECK (role IN ('CITY_COUNCILOR', 'DEPUTY', 'SENATOR')),
  photo_url TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id    TEXT PRIMARY KEY,
  uf    CHAR(2) NOT NULL REFERENCES ufs(uf)
);

CREATE TABLE IF NOT EXISTS users_politicians_followed (
  user_id    TEXT NOT NULL REFERENCES users(id),
  politician_id    TEXT NOT NULL REFERENCES politicians(id),
  PRIMARY KEY (user_id, politician_id)
);

CREATE TABLE IF NOT EXISTS users_parties_followed (
  user_id       TEXT NOT NULL REFERENCES users(id),
  uf_id    TEXT NOT NULL REFERENCES ufs(uf),
  PRIMARY KEY (user_id, uf_id)
);`,
  },
  {
    version: '002_fill_ufs',
    sql: `INSERT INTO ufs (uf, name) VALUES
  ('AC', 'Acre'),
  ('AL', 'Alagoas'),
  ('AP', 'Amapá'),
  ('AM', 'Amazonas'),
  ('BA', 'Bahia'),
  ('CE', 'Ceará'),
  ('DF', 'Distrito Federal'),
  ('ES', 'Espírito Santo'),
  ('GO', 'Goiás'),
  ('MA', 'Maranhão'),
  ('MT', 'Mato Grosso'),
  ('MS', 'Mato Grosso do Sul'),
  ('MG', 'Minas Gerais'),
  ('PA', 'Pará'),
  ('PB', 'Paraíba'),
  ('PR', 'Paraná'),
  ('PE', 'Pernambuco'),
  ('PI', 'Piauí'),
  ('RJ', 'Rio de Janeiro'),
  ('RN', 'Rio Grande do Norte'),
  ('RS', 'Rio Grande do Sul'),
  ('RO', 'Rondônia'),
  ('RR', 'Roraima'),
  ('SC', 'Santa Catarina'),
  ('SP', 'São Paulo'),
  ('SE', 'Sergipe'),
  ('TO', 'Tocantins');`,
  },
];
