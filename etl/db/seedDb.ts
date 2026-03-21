import Database from 'better-sqlite3';
import { migrations } from '../../app/src/shared/db/migrations';

export function createSeedDb(outputPath: string): Database.Database {
  const db = new Database(outputPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  for (const { sql } of migrations) {
    db.exec(sql);
  }
  return db;
}
