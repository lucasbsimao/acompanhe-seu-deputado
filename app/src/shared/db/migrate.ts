import type { SQLiteDatabase } from 'react-native-sqlite-storage';
import { migrations } from './migrations';

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
