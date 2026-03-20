import { DeputiesETL } from './pipelines/DeputiesPipeline';

async function main(): Promise<void> {
  try {
    const etl = new DeputiesETL();
    await etl.execute();
    console.log('ETL completed successfully');
  } catch (error) {
    console.error('ETL failed:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
