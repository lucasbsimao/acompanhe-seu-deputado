import Database from 'better-sqlite3';
import { migrations } from '../../src/shared/db/migrations';

// --- SQLiteDatabase adapter (wraps better-sqlite3 to match react-native-sqlite-storage interface) ---

export interface SQLiteTransaction {
  executeSql(sql: string, params?: unknown[]): void;
}

export interface SQLiteDatabase {
  executeSql(sql: string, params?: unknown[]): Promise<[{ rows: { length: number; item: (index: number) => unknown } }]>;
  transaction(fn: (tx: SQLiteTransaction) => void): Promise<void>;
}

class BetterSqlite3Adapter implements SQLiteDatabase {
  constructor(private db: Database.Database) {}

  transaction(fn: (tx: SQLiteTransaction) => void): Promise<void> {
    const statements: Array<{ sql: string; params: unknown[] }> = [];
    fn({
      executeSql: (sql: string, params: unknown[] = []) => {
        statements.push({ sql, params });
      },
    });
    const run = this.db.transaction(() => {
      for (const { sql, params } of statements) {
        this.db.prepare(sql).run(...params);
      }
    });
    run();
    return Promise.resolve();
  }

  async executeSql(sql: string, params: unknown[] = []): Promise<[{ rows: { length: number; item: (index: number) => unknown } }]> {
    try {
      if (!this.db.open) {
        throw new Error('Database is closed');
      }
      const stmt = this.db.prepare(sql);
      const trimmedSql = sql.trim().toUpperCase();

      if (trimmedSql.startsWith('SELECT')) {
        const result = stmt.all(...params) as unknown[];
        return [
          {
            rows: {
              length: result.length,
              item: (index: number) => result[index],
            },
          },
        ];
      } else {
        stmt.run(...params);
        return [
          {
            rows: {
              length: 0,
              item: () => undefined,
            },
          },
        ];
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`SQL execution failed: ${error.message}`);
      }
      throw error;
    }
  }
}

// --- Migration runner (sync, for tests) ---

const createSchemaMigrationsTable = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`;

const splitStatements = (sql: string): string[] =>
  sql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);

function runMigrationsSync(db: Database.Database): void {
  db.exec(createSchemaMigrationsTable);

  const result = db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: string }>;
  const applied = new Set<string>(result.map((row) => row.version));

  for (const migration of migrations) {
    if (applied.has(migration.version)) {
      continue;
    }
    const statements = splitStatements(migration.sql);
    for (const statement of statements) {
      db.exec(statement);
    }
    db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(migration.version);
  }
}

// --- Test database factory ---

export interface TestDatabase {
  db: SQLiteDatabase;
  rawDb: Database.Database;
  close: () => void;
  clearData: () => void;
}

export function useTestDatabase() {
  let testDb: TestDatabase;

  beforeAll(() => {
    testDb = createTestDatabase();
  });

  afterAll(() => {
    if (testDb.rawDb.open) {
      testDb.close();
    }
  });

  beforeEach(() => {
    if (!testDb.rawDb.open) {
      testDb = createTestDatabase();
    }
  });

  return {
    getDb: () => testDb,
  };
}

export function createTestDatabase(): TestDatabase {
  const db = new Database(':memory:');

  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('journal_mode = WAL');

  runMigrationsSync(db);

  const adapter = new BetterSqlite3Adapter(db);

  return {
    db: adapter,
    rawDb: db,
    close: () => {
      db.close();
    },
    clearData: () => {
      if (db.open) {
        db.exec('DELETE FROM users_parties_followed');
        db.exec('DELETE FROM users_politicians_followed');
        db.exec('DELETE FROM users');
        db.exec('DELETE FROM politicians');
      }
    },
  };
}
