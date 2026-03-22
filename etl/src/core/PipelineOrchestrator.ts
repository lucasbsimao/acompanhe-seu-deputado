import type Database from 'better-sqlite3';
import { PipelineInfo, PipelineConstructor } from '../types/Pipeline';
import { readdirSync } from 'fs';
import { join } from 'path';

export class PipelineOrchestrator {
  constructor(private readonly db: Database.Database) {}

  async executeOne(pipelineClassName: string, forceDownload: boolean, isAutomated = false): Promise<void> {
    const PipelineClass = await this.loadPipelineClass(pipelineClassName);
    const pipeline = new PipelineClass(this.db);
    await pipeline.promptForOptions(isAutomated);
    await pipeline.execute(forceDownload);
  }

  async executeAll(pipelines: PipelineInfo[], forceDownload: boolean): Promise<void> {
    for (const pipeline of pipelines) {
      console.log(`Executing ${pipeline.displayName}...`);
      await this.executeOne(pipeline.className, forceDownload, true);
    }
    console.log('All pipelines completed successfully');
  }

  async executeSelected(
    pipelines: PipelineInfo[],
    selectedClassName: string,
    forceDownload: boolean
  ): Promise<void> {
    const selectedPipeline = pipelines.find((p) => p.className === selectedClassName);
    if (!selectedPipeline) {
      throw new Error(`Pipeline ${selectedClassName} not found`);
    }

    console.log(`Executing ${selectedPipeline.displayName}...`);
    await this.executeOne(selectedPipeline.className, forceDownload, false);
    console.log(`${selectedPipeline.displayName} completed successfully`);
  }

  async discoverPipelines(): Promise<PipelineInfo[]> {
    const pipelinesDir = join(__dirname, '..', 'pipelines');
    const files = readdirSync(pipelinesDir).filter(
      (file) => file.endsWith('Pipeline.js') && file !== 'BasePipeline.js'
    );

    return files.map((file) => {
      const className = file.replace('.js', '');
      const displayName = this.camelCaseToSpaced(className.replace('Pipeline', '')) + ' Pipeline';

      return {
        name: className,
        displayName,
        className,
        filePath: join(pipelinesDir, file),
      };
    });
  }

  async loadPipelineClass(
    className: string
  ): Promise<PipelineConstructor> {
    const module = await import(`../pipelines/${className}`);
    return module[className];
  }

  private camelCaseToSpaced(camelCase: string): string {
    return camelCase
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .replace(/^./, (str) => str.toUpperCase());
  }
}
