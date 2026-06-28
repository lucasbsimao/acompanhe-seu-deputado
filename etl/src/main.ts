// SPDX-License-Identifier: AGPL-3.0-or-later

import { PipelineOrchestrator } from './core/PipelineOrchestrator';
import { DatabaseManager } from './db/DatabaseManager';
import { CliRunner } from './cli/CliRunner';
import { EtlError, EtlErrorCode } from './core/errors';
import { setupLogging } from './util/logger';

setupLogging();

const dbManager = new DatabaseManager();

function setupSignalHandlers(): void {
  const cleanup = (signal: string) => {
    console.log(`\n${signal} received. Closing database connection...`);
    dbManager.close();
    console.log('Database closed successfully');
    process.exit(0);
  };

  process.on('SIGINT', () => cleanup('SIGINT'));
  process.on('SIGTERM', () => cleanup('SIGTERM'));
}

async function main(): Promise<void> {
  setupSignalHandlers();

  const cli = new CliRunner();
  try {
    const options = cli.parseArguments(process.argv.slice(2));
    const db = dbManager.initialize(options.forceDownload);

    const orchestrator = new PipelineOrchestrator(db);

    const pipelines = await orchestrator.discoverPipelines();
    const selection = await cli.selectPipeline(pipelines);

    if (selection.executeAll) {
      await orchestrator.executeAll(pipelines, options.forceDownload);
    } else if (selection.selectedPipeline) {
      await orchestrator.executeSelected(
        pipelines,
        selection.selectedPipeline,
        options.forceDownload,
      );
    }

    dbManager.deploy();
  } catch (error) {
    if (error instanceof EtlError) {
      if (error.code === EtlErrorCode.USER_CANCELLED) {
        console.log('\nOperation cancelled by user');
      } else {
        console.error('ETL Error [%s]: %s', error.code, error.message);
        if (error.context) {
          console.error('Context: %o', error.context);
        }
      }
    } else {
      console.error('Unexpected error during ETL: %o', error);
    }
  } finally {
    dbManager.close();
  }
}

main().catch((error: unknown) => {
  console.error('Unhandled error: %o', error);
  dbManager.close();
  process.exit(1);
});
