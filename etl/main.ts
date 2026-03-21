import { join } from 'path';
import { existsSync, unlinkSync } from 'fs';
import { DeputiesPipeline } from './pipelines/DeputiesPipeline';
import { createSeedDb } from './db/seedDb';
import { copyToAssets } from './db/copyToAssets';

const DB_FILE_NAME = 'seed.db';
const DB_PATH = join(process.cwd(), DB_FILE_NAME);

async function main(): Promise<void> {
  if (existsSync(DB_PATH)) {
    unlinkSync(DB_PATH);
  }

  const db = createSeedDb(DB_PATH);

  try {
    const etl = new DeputiesPipeline(db);
    await etl.execute();
    
    console.log('ETL completed successfully');
    
    copyToAssets(DB_PATH);
  }
  catch (error) {
    console.error('Error during ETL:', error);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
