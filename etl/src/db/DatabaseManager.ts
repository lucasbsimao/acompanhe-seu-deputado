import { join, basename } from 'path';
import { existsSync, unlinkSync, copyFileSync, mkdirSync } from 'fs';
import Database from 'better-sqlite3';
import { migrations } from '../../../app/src/shared/db/migrations';

const DB_FILE_NAME = 'seed.db';

// Assumes the ETL is run from within the etl/ directory (npm run start / npm run dev)
const PROJECT_ROOT = join(process.cwd(), '..');

const ANDROID_ASSETS = join(PROJECT_ROOT, 'android', 'app', 'src', 'main', 'assets');
const IOS_BUNDLE = join(PROJECT_ROOT, 'ios', 'AcompanheSeuDeputado');

export class DatabaseManager {
  private db: Database.Database | null = null;
  private readonly dbPath: string;

  constructor(workingDirectory: string = process.cwd()) {
    this.dbPath = workingDirectory === ':memory:' ? ':memory:' : join(workingDirectory, DB_FILE_NAME);
  }

  initialize(cleanStart = false): Database.Database {
    if (cleanStart) {
      this.cleanup();
    }
    
    // Create directory if it doesn't exist (skip for :memory: databases)
    if (this.dbPath !== ':memory:') {
      const dir = join(this.dbPath, '..');
      mkdirSync(dir, { recursive: true });
    }
    
    this.db = new Database(this.dbPath);
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
    for (const { sql } of migrations) {
      this.db.exec(sql);
    }

    return this.db;
  }

  private cleanup(): void {
    if (existsSync(this.dbPath)) {
      unlinkSync(this.dbPath);
    }
  }

  deploy(): void {
    if (!this.db) {
      throw new Error('Database must be initialized before deployment');
    }

    const dbFileName = basename(this.dbPath);

    mkdirSync(ANDROID_ASSETS, { recursive: true });
    copyFileSync(this.dbPath, join(ANDROID_ASSETS, dbFileName));
    console.log(`Copied to Android assets: ${join(ANDROID_ASSETS, dbFileName)}`);

    copyFileSync(this.dbPath, join(IOS_BUNDLE, dbFileName));
    console.log(`Copied to iOS bundle: ${join(IOS_BUNDLE, dbFileName)}`);
    console.log('Note: ensure seed.db is added as a bundle resource in Xcode.');
  }

  close(): void {
    if (this.db) {
      try {
        this.db.pragma('wal_checkpoint(TRUNCATE)');
      } catch (error) {
        console.error('Error during WAL checkpoint:', error);
      }
      this.db.close();
      this.db = null;
    }
  }

  getDatabase(): Database.Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }
}
