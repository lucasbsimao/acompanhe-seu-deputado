import type { SQLiteDatabase } from 'react-native-sqlite-storage';

type Migration = {
  version: string;
  sql: string;
};

const migrations: Migration[] = [
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
  role   TEXT NOT NULL CHECK (role IN ('CITY_COUNCILOR', 'DEPUTY', 'SENATOR'))
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
    version: '002_fill_ufs_and_parties',
    sql: `INSERT INTO ufs (uf, name) VALUES
  ('AC', 'Acre'),
  ('AL', 'Alagoas'),
  ('AP', 'Amapá'),
  ('AM', 'Amazonas'),
  ('BA', 'Bahia'),
  ('CE', 'Ceará'),
  ('DF', 'Distrito Federal'),
  ('ES', 'Espírito Santo'),
  ('GO', 'Goiás'),
  ('MA', 'Maranhão'),
  ('MT', 'Mato Grosso'),
  ('MS', 'Mato Grosso do Sul'),
  ('MG', 'Minas Gerais'),
  ('PA', 'Pará'),
  ('PB', 'Paraíba'),
  ('PR', 'Paraná'),
  ('PE', 'Pernambuco'),
  ('PI', 'Piauí'),
  ('RJ', 'Rio de Janeiro'),
  ('RN', 'Rio Grande do Norte'),
  ('RS', 'Rio Grande do Sul'),
  ('RO', 'Rondônia'),
  ('RR', 'Roraima'),
  ('SC', 'Santa Catarina'),
  ('SP', 'São Paulo'),
  ('SE', 'Sergipe'),
  ('TO', 'Tocantins');`,
  },
];

const createSchemaMigrationsTable = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`;

const splitStatements = (sql: string): string[] =>
  sql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);

export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  await db.executeSql(createSchemaMigrationsTable);
  const [result] = await db.executeSql('SELECT version FROM schema_migrations');
  const applied = new Set<string>();
  for (let i = 0; i < result.rows.length; i += 1) {
    applied.add(result.rows.item(i).version as string);
  }

  for (const migration of migrations) {
    if (applied.has(migration.version)) {
      continue;
    }
    const statements = splitStatements(migration.sql);
    for (const statement of statements) {
      await db.executeSql(statement);
    }
    await db.executeSql('INSERT INTO schema_migrations (version) VALUES (?)', [migration.version]);
  }
}
