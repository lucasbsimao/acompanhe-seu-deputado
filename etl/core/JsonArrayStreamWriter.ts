import * as fs from 'fs';

export class JsonArrayStreamWriter<T> {
  private file: fs.WriteStream | null = null;
  private wroteAny: boolean = false;
  private closed: boolean = false;
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async open(): Promise<void> {
    if (this.file) {
      throw new Error('Stream is already open');
    }

    this.file = fs.createWriteStream(this.filePath, { encoding: 'utf8' });

    return new Promise((resolve, reject) => {
      if (!this.file) {
        reject(new Error('Failed to create write stream'));
        return;
      }

      this.file.on('open', () => {
        if (this.file) {
          this.file.write('[', (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        }
      });

      this.file.on('error', reject);
    });
  }

  async writeItems(items: T[]): Promise<void> {
    if (this.closed) {
      throw new Error('Stream writer is closed');
    }

    if (!this.file) {
      throw new Error('Stream is not open');
    }

    return new Promise((resolve, reject) => {
      let itemsWritten = 0;

      const writeNext = () => {
        if (itemsWritten >= items.length) {
          resolve();
          return;
        }

        if (this.wroteAny) {
          this.file!.write(',', (err) => {
            if (err) {
              reject(err);
            } else {
              writeItemJson();
            }
          });
        } else {
          this.wroteAny = true;
          writeItemJson();
        }
      };

      const writeItemJson = () => {
        const json = JSON.stringify(items[itemsWritten]);

        this.file!.write(json, (err) => {
          if (err) {
            reject(err);
          } else {
            itemsWritten++;
            writeNext();
          }
        });
      };

      writeNext();
    });
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;

    if (!this.file) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.file!.write(']', (err: Error | null | undefined) => {
        if (err) {
          this.file!.destroy();
          reject(err);
        } else {
          this.file!.end((err: Error | null | undefined) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        }
      });
    });
  }
}
