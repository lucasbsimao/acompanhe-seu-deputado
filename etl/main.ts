import { DeputiesETL } from './pipelines/DeputiesPipeline';

class Application {
  async run(): Promise<void> {
    const controller = new AbortController();
    const timeoutMs = 30000;

    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const etl = new DeputiesETL();
      await etl.execute(controller.signal);
      console.log('ETL completed successfully');
    } catch (error) {
      if (error instanceof Error && error.message === 'Aborted') {
        console.error('ETL operation timed out after 30 seconds');
        process.exit(1);
      }
      console.error('ETL failed:', error);
      process.exit(1);
    } finally {
      clearTimeout(timeout);
    }
  }
}

const app = new Application();
app.run();
