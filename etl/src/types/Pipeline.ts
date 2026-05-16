import type Database from 'better-sqlite3';

export interface IPipeline {
  execute(forceDownload?: boolean): Promise<void>;
}

export interface IPipelineDepChain {
  readonly dependencies: readonly IPipelineDepChain[];
}

// Constructor signature + static metadata in one named type
export interface IPipelineClass extends IPipelineDepChain {
  new (db: Database.Database): IPipeline;
}

export interface PipelineInfo {
  name: string;
  displayName: string;
  className: string;
  filePath: string;
  importPath: string; // e.g. 'dados-abertos-camara/DeputiesPipeline'
  dependencies: readonly string[];
}
