import type Database from 'better-sqlite3';

export interface IPipeline {
  execute(forceDownload?: boolean): Promise<void>;
}

export type PipelineConstructor = new (db: Database.Database) => IPipeline;

export interface PipelineInfo {
  name: string;
  displayName: string;
  className: string;
  filePath: string;
  importPath: string; // e.g. 'dados-abertos-camara/DeputiesPipeline'
}
