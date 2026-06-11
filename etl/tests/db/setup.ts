// SPDX-License-Identifier: AGPL-3.0-or-later

import type Database from 'better-sqlite3';
import { before, after, beforeEach } from 'node:test';
import { DatabaseManager } from '../../src/db/DatabaseManager';

export interface TestDatabase {
  db: Database.Database;
  close: () => void;
  clearData: () => void;
}

export function useTestDatabase() {
  let testDb: TestDatabase | undefined;

  before(() => {
    testDb = createTestDatabase();
  });

  after(() => {
    if (testDb?.db.open) {
      testDb.close();
    }
  });

  beforeEach(() => {
    if (!testDb?.db.open) {
      testDb = createTestDatabase();
    }
    testDb.clearData();
  });

  return {
    getDb: (): TestDatabase => {
      if (!testDb)
        throw new Error('testDb not initialized — is getDb() called outside a test body?');
      return testDb;
    },
  };
}

export function createTestDatabase(): TestDatabase {
  const dbManager = new DatabaseManager(':memory:');
  const db = dbManager.initialize();
  db.pragma('busy_timeout = 5000');

  return {
    db,
    close: () => db.close(),
    clearData: () => {
      if (db.open) {
        db.exec('DELETE FROM forensic_flags');
        db.exec('DELETE FROM vendor_partners');
        db.exec('DELETE FROM vendors');
        db.exec('DELETE FROM expenses');
        db.exec('DELETE FROM emendas_parlamentares');
        db.exec('DELETE FROM politicians');
        db.exec('DELETE FROM parties');
        db.exec('DELETE FROM pipeline_runs');
      }
    },
  };
}
