// SPDX-License-Identifier: AGPL-3.0-or-later

import { createWriteStream, mkdirSync, existsSync, readdirSync, rmSync } from 'fs';
import { pipeline } from 'stream/promises';
import { execFileSync } from 'child_process';
import { join } from 'path';
import type { HttpClient } from './HttpClient';
import { logger } from '../util/logger';

export interface BasicAuthOptions {
  username: string;
  password: string;
}

export class FileDownloader {
  constructor(private readonly httpClient: HttpClient) {}

  async downloadFile(url: string, destPath: string, auth?: BasicAuthOptions): Promise<void> {
    const dir = join(destPath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const response = await this.httpClient.requestStream(url, auth ? { auth } : undefined);

    await pipeline(response.data, createWriteStream(destPath));
    logger.info({ destPath }, 'file downloaded');
  }

  extractZip(zipPath: string, extractPath: string): void {
    if (!existsSync(extractPath)) {
      mkdirSync(extractPath, { recursive: true });
    }

    execFileSync('unzip', ['-o', '-q', zipPath, '-d', extractPath]);
    logger.info({ extractPath }, 'zip extracted');
  }

  cleanupDir(dir: string): void {
    if (!existsSync(dir)) return;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      logger.warn({ dir, err: error }, 'cleanup warning');
    }
  }

  listFiles(dir: string, prefix?: string): string[] {
    const files = readdirSync(dir);
    const filtered = prefix ? files.filter(f => f.startsWith(prefix)) : files;
    return filtered.map(f => join(dir, f));
  }
}
