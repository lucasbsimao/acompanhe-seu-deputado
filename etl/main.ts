import { PipelineOrchestrator } from './core/PipelineOrchestrator';
import { DatabaseManager } from './db/DatabaseManager';
import { CliRunner } from './cli/CliRunner';

async function main(): Promise<void> {
  const cli = new CliRunner();
  const dbManager = new DatabaseManager();
  try {
    const options = cli.parseArguments(process.argv.slice(2));
    const db = dbManager.initialize(options.forceDownload);

    const orchestrator = new PipelineOrchestrator(db);

    const pipelines = await orchestrator.discoverPipelines();
    const selection = await cli.selectPipeline(pipelines);
  
    if (selection.executeAll) {
      await orchestrator.executeAll(pipelines, options.forceDownload);
    } else if (selection.selectedPipeline) {
      await orchestrator.executeSelected(pipelines, selection.selectedPipeline, options.forceDownload);
    }

    dbManager.deploy();
  } catch (error) {
    console.error('Error during ETL:', error);
  } finally {
    dbManager.close();
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
