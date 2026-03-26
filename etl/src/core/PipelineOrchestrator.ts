import type Database from 'better-sqlite3';
import { PipelineInfo, PipelineConstructor } from '../types/Pipeline';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';

export class PipelineOrchestrator {
  constructor(private readonly db: Database.Database) {}

  async executeOne(importPath: string, forceDownload: boolean): Promise<void> {
    const PipelineClass = await this.loadPipelineClass(importPath);
    const pipeline = new PipelineClass(this.db);
    await pipeline.execute(forceDownload);
  }

  async executeAll(pipelines: PipelineInfo[], forceDownload: boolean): Promise<void> {
    for (const pipeline of pipelines) {
      console.log(`Executing ${pipeline.displayName}...`);
      await this.executeOne(pipeline.importPath, forceDownload);
    }
    console.log('All pipelines completed successfully');
  }

  async executeSelected(
    pipelines: PipelineInfo[],
    selectedClassName: string,
    forceDownload: boolean
  ): Promise<void> {
    const selected = pipelines.find((p) => p.className === selectedClassName);
    if (!selected) throw new Error(`Pipeline ${selectedClassName} not found`);
    console.log(`Executing ${selected.displayName}...`);
    await this.executeOne(selected.importPath, forceDownload);
    console.log(`${selected.displayName} completed successfully`);
  }

  async discoverPipelines(): Promise<PipelineInfo[]> {
    const pipelinesDir = join(__dirname, '..', 'pipelines');
    const results: PipelineInfo[] = [];

    // Dynamically discover all subdirectories
    const subdirs = readdirSync(pipelinesDir).filter((f) => {
      const fullPath = join(pipelinesDir, f);
      try {
        return statSync(fullPath).isDirectory();
      } catch {
        return false;
      }
    });

    for (const subdir of subdirs) {
      const subdirPath = join(pipelinesDir, subdir);
      const files = readdirSync(subdirPath).filter(
        (f) => f.endsWith('Pipeline.js') && f !== 'BasePipeline.js'
      );

      for (const file of files) {
        const className = file.replace('.js', '');
        const displayName = this.camelCaseToSpaced(className.replace('Pipeline', '')) + ' Pipeline';
        results.push({
          name: className,
          displayName,
          className,
          filePath: join(subdirPath, file),
          importPath: `${subdir}/${className}`,
        });
      }
    }

    return results;
  }

  async loadPipelineClass(importPath: string): Promise<PipelineConstructor> {
    const module = await import(`../pipelines/${importPath}`);
    const className = importPath.split('/').pop()!;
    return module[className];
  }

  private camelCaseToSpaced(camelCase: string): string {
    return camelCase
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .replace(/^./, (str) => str.toUpperCase());
  }
}
