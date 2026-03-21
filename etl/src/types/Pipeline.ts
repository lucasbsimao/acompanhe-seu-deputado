import type Database from 'better-sqlite3';
import { BasePipeline } from '../core/BasePipeline';

export type PipelineConstructor = new (db: Database.Database) => BasePipeline<unknown>;

export interface PipelineInfo {
  name: string;
  displayName: string;
  className: string;
  filePath: string;
}
