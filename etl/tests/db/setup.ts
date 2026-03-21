import Database from 'better-sqlite3';
import { before, after, beforeEach } from 'node:test';
import { createSeedDb } from '../../db/seedDb';

export interface TestDatabase {
  db: Database.Database;
  close: () => void;
  clearData: () => void;
}

export function useTestDatabase() {
  let testDb: TestDatabase;

  before(() => {
    testDb = createTestDatabase();
  });

  after(() => {
    if (testDb.db.open) {
      testDb.close();
    }
  });

  beforeEach(() => {
    if (!testDb.db.open) {
      testDb = createTestDatabase();
    }
    testDb.clearData();
  });

  return {
    getDb: () => testDb,
  };
}

export function createTestDatabase(): TestDatabase {
  const db = createSeedDb(':memory:');
  db.pragma('busy_timeout = 5000');

  return {
    db,
    close: () => db.close(),
    clearData: () => {
      if (db.open) {
        db.exec('DELETE FROM politicians');
        db.exec('DELETE FROM parties');
      }
    },
  };
}
