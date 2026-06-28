// SPDX-License-Identifier: AGPL-3.0-or-later

import prompts from 'prompts';
import type { PipelineInfo } from '../types/Pipeline';
import { UserCancelledError } from '../core/errors';
import { logger } from '../util/logger';

export interface CliOptions {
  forceDownload: boolean;
}

export interface PipelineSelection {
  selectedPipeline: string | null;
  executeAll: boolean;
}

export class CliRunner {
  parseArguments(args: string[]): CliOptions {
    return {
      forceDownload: args.includes('--force-download'),
    };
  }

  async selectPipeline(pipelines: PipelineInfo[]): Promise<PipelineSelection> {
    if (pipelines.length === 0) {
      logger.error('no pipelines found');
      return { selectedPipeline: null, executeAll: false };
    }

    const choices = [
      ...pipelines.map(p => ({
        title: p.displayName,
        value: p.className,
      })),
      {
        title: 'Execute All',
        value: 'all',
      },
    ];

    const response = await prompts<'pipeline'>(
      {
        type: 'select',
        name: 'pipeline',
        message: 'Select a pipeline to execute',
        choices,
      },
      {
        onCancel: () => {
          throw new UserCancelledError();
        },
      },
    );

    if (!response.pipeline) {
      logger.info('no pipeline selected');
      process.exit(0);
    }

    return {
      selectedPipeline: response.pipeline === 'all' ? null : String(response.pipeline),
      executeAll: response.pipeline === 'all',
    };
  }
}
