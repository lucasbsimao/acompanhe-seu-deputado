import axios from 'axios';
import { createWriteStream, mkdirSync, existsSync } from 'fs';
import { pipeline } from 'stream/promises';
import AdmZip from 'adm-zip';
import { join } from 'path';

export class FileDownloader {
  async downloadFile(url: string, destPath: string): Promise<void> {
    const dir = join(destPath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const response = await axios({
      method: 'GET',
      url,
      responseType: 'stream',
      timeout: 60000,
    });

    await pipeline(response.data, createWriteStream(destPath));
    console.log(`Downloaded: ${destPath}`);
  }

  extractZip(zipPath: string, extractPath: string): void {
    if (!existsSync(extractPath)) {
      mkdirSync(extractPath, { recursive: true });
    }

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractPath, true);
    console.log(`Extracted to: ${extractPath}`);
  }
}
