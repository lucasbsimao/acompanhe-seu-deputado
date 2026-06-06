import { createWriteStream, mkdirSync, existsSync } from 'fs';
import { pipeline } from 'stream/promises';
import { execFileSync } from 'child_process';
import { join } from 'path';
import type { HttpClient } from './HttpClient';

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
    console.log(`Downloaded: ${destPath}`);
  }

  extractZip(zipPath: string, extractPath: string): void {
    if (!existsSync(extractPath)) {
      mkdirSync(extractPath, { recursive: true });
    }

    execFileSync('unzip', ['-o', '-q', zipPath, '-d', extractPath]);
    console.log(`Extracted to: ${extractPath}`);
  }
}
