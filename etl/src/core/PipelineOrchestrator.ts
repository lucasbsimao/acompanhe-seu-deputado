import type Database from 'better-sqlite3';
import type { PipelineInfo, IPipelineClass } from '../types/Pipeline';
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
    const sorted = PipelineOrchestrator.resolveExecutionOrder(pipelines);
    for (const pipeline of sorted) {
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

    const subset = PipelineOrchestrator.retrievePipelineDeps(pipelines, selected);
    const sorted = PipelineOrchestrator.resolveExecutionOrder(subset);
    for (const pipeline of sorted) {
      if (pipeline.className === selected.className) continue;
      console.log(`Executing dependency ${pipeline.displayName}...`);
      await this.executeOne(pipeline.importPath, false);
    }
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
        const importPath = `${subdir}/${className}`;
        const PipelineClass = await this.loadPipelineClass(importPath);

        PipelineOrchestrator.assertValidPipelineClass(PipelineClass, className);

        const dependencies = PipelineClass.dependencies.map((dep) => (dep as unknown as { name: string }).name);
        results.push({
          name: className,
          displayName,
          className,
          filePath: join(subdirPath, file),
          importPath,
          dependencies,
        });
      }
    }

    return results;
  }

  async loadPipelineClass(importPath: string): Promise<IPipelineClass> {
    const module = await import(`../pipelines/${importPath}`) as Record<string, IPipelineClass>;
    const className = importPath.split('/').at(-1) ?? importPath;
    return module[className];
  }

  /**
   * Retrieves all Pipelines that a given root pipeline depends on via breadth-first search.
   * @param pipelines All available pipelines
   * @param root The root pipeline to start from
   * @returns All pipelines in the transitive dependency set (including root)
   */
  private static retrievePipelineDeps(
    pipelines: PipelineInfo[],
    root: PipelineInfo
  ): PipelineInfo[] {
    const byName = new Map(pipelines.map((p) => [p.className, p]));
    const visited = new Set<string>();
    const result: PipelineInfo[] = [];
    const queue = [root];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || visited.has(current.className)) continue;
      visited.add(current.className);
      result.push(current);
      for (const dep of current.dependencies) {
        const depInfo = byName.get(dep);
        if (depInfo && !visited.has(dep)) queue.push(depInfo);
      }
    }
    return result;
  }

  /**
   * Resolves the execution order of pipelines using Kahn's algorithm.
   * Topologically sort by in-degree; detect cycles and unknown deps
   * @param pipelines All available pipelines
   * @returns A sorted array of pipelines in execution order
   */
  private static resolveExecutionOrder(pipelines: PipelineInfo[]): PipelineInfo[] {
    const byName = new Map(pipelines.map((p) => [p.className, p]));

    for (const p of pipelines) {
      for (const dep of p.dependencies) {
        if (!byName.has(dep)) throw new Error(`Unknown dependency: ${dep}`);
      }
    }

    const inDegree = new Map(pipelines.map((p) => [p.className, 0]));
    const dependents = new Map<string, string[]>(pipelines.map((p) => [p.className, []]));

    for (const p of pipelines) {
      for (const dep of p.dependencies) {
        dependents.get(dep)?.push(p.className);
        inDegree.set(p.className, (inDegree.get(p.className) ?? 0) + 1);
      }
    }

    const queue = pipelines.filter((p) => inDegree.get(p.className) === 0);
    const result: PipelineInfo[] = [];

    while (queue.length > 0) {
      const node = queue.shift();
      if (!node) break;
      result.push(node);
      for (const depName of dependents.get(node.className) ?? []) {
        const newDeg = (inDegree.get(depName) ?? 0) - 1;
        inDegree.set(depName, newDeg);
        const next = byName.get(depName);
        if (newDeg === 0 && next) queue.push(next);
      }
    }

    if (result.length < pipelines.length) {
      const remaining = pipelines
        .filter((p) => !result.includes(p))
        .map((p) => p.className)
        .join(', ');
      throw new Error(`Circular dependency detected involving: ${remaining}`);
    }

    return result;
  }

  /**
   * Runtime guard: `loadPipelineClass` casts the dynamic import result to {@link IPipelineClass} without
   * verification, so a pipeline that omits required members would silently pass TypeScript's checks but fail here.
   */
  private static assertValidPipelineClass(PipelineClass: IPipelineClass, className: string): void {
    if (
      !Array.isArray(PipelineClass.dependencies) ||
      typeof PipelineClass !== 'function' ||
      typeof (PipelineClass.prototype as { execute?: unknown }).execute !== 'function'
    ) {
      throw new Error(`Pipeline ${className} does not implement IPipelineClass`);
    }
  }

  private camelCaseToSpaced(camelCase: string): string {
    return camelCase
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .replace(/^./, (str) => str.toUpperCase());
  }
}
