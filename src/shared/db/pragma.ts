import type { SQLiteDatabase } from 'react-native-sqlite-storage';

const PRAGMAS = [
  'PRAGMA foreign_keys = ON',
  'PRAGMA busy_timeout = 5000',
  'PRAGMA journal_mode = WAL',
];

export async function applyPragmas(db: SQLiteDatabase): Promise<void> {
  for (const pragma of PRAGMAS) {
    try {
      await db.executeSql(pragma);
    } catch (error) {
      console.warn(`[DB] Failed to apply pragma: ${pragma}`, error);
    }
  }
}
