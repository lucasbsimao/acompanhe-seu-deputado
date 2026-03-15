import SQLite, { SQLiteDatabase } from 'react-native-sqlite-storage';
import { applyPragmas } from './pragma';

SQLite.enablePromise(true);

export async function openDb(): Promise<SQLiteDatabase> {
  const db = await SQLite.openDatabase({ name: 'acompanheseudeputado.db', location: 'default' });
  await applyPragmas(db);
  return db;
}
