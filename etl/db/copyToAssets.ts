import { copyFileSync, mkdirSync } from 'fs';
import { join, basename } from 'path';

// Assumes the ETL is run from within the etl/ directory (npm run start / npm run dev)
const PROJECT_ROOT = join(process.cwd(), '..');

const ANDROID_ASSETS = join(PROJECT_ROOT, 'android', 'app', 'src', 'main', 'assets');
const IOS_BUNDLE = join(PROJECT_ROOT, 'ios', 'AcompanheSeuDeputado');

export function copyToAssets(dbPath: string): void {
  const dbFileName = basename(dbPath);

  mkdirSync(ANDROID_ASSETS, { recursive: true });
  copyFileSync(dbPath, join(ANDROID_ASSETS, dbFileName));
  console.log(`Copied to Android assets: ${join(ANDROID_ASSETS, dbFileName)}`);

  copyFileSync(dbPath, join(IOS_BUNDLE, dbFileName));
  console.log(`Copied to iOS bundle: ${join(IOS_BUNDLE, dbFileName)}`);
  console.log('Note: ensure seed.db is added as a bundle resource in Xcode.');
}
