// SPDX-License-Identifier: AGPL-3.0-or-later

import { PipelineOrchestrator } from './core/PipelineOrchestrator';
import { DatabaseManager } from './db/DatabaseManager';
import { CliRunner } from './cli/CliRunner';
import { EtlError, EtlErrorCode } from './core/errors';
import { logger, closeLogger } from './util/logger';

const dbManager = new DatabaseManager();

function setupSignalHandlers(): void {
  const cleanup = async (signal: string) => {
    logger.info({ signal }, 'shutdown signal received, closing database');
    dbManager.close();
    logger.info('database closed');
    await closeLogger();
    process.exit(0);
  };

  process.on('SIGINT', () => void cleanup('SIGINT'));
  process.on('SIGTERM', () => void cleanup('SIGTERM'));
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
        logger.info('operation cancelled by user');
      } else {
        logger.error({ errorCode: error.code, context: error.context, err: error }, 'ETL error');
      }
    } else {
      logger.error({ err: error }, 'unexpected ETL error');
    }
  } finally {
    dbManager.close();
    await closeLogger();
  }
}

main().catch((error: unknown) => {
  logger.error({ err: error }, 'unhandled error');
  dbManager.close();
  void closeLogger().then(() => process.exit(1));
});
