import { HttpClient } from '../../core/HttpClient';
import defaultConfig from '../../config/defaults.json';

export interface PortalPaginationConfig {
  pageSize?: number;
  maxRetries?: number;
  retryWaitMin?: number;
  retryWaitMax?: number;
  timeoutMs?: number;
}

export abstract class BasePipeline<T> {
  protected httpClient: HttpClient;
  protected pageSize: number;
  private readonly apiKey: string;

  constructor(config: PortalPaginationConfig = {}) {
    const key = process.env.PORTAL_TRANSPARENCIA_API_KEY;
    if (!key) {
      throw new Error('PORTAL_TRANSPARENCIA_API_KEY environment variable is not set');
    }
    this.apiKey = key;

    this.pageSize = config.pageSize && config.pageSize > 0
      ? config.pageSize
      : defaultConfig.pagination.pageSize;

    this.httpClient = new HttpClient(
      {
        maxRetries: config.maxRetries ?? defaultConfig.pagination.maxRetries,
        retryWaitMin: config.retryWaitMin ?? defaultConfig.pagination.retryWaitMin,
        retryWaitMax: config.retryWaitMax ?? defaultConfig.pagination.retryWaitMax,
      },
      config.timeoutMs ?? defaultConfig.pagination.timeoutMs
    );
  }

  abstract buildUrl(page: number, pageSize: number): Promise<string>;
  abstract decodePage(data: unknown): Promise<T[]>;
  abstract shouldDownload(): Promise<boolean>;
  abstract onPageFetched(items: T[]): Promise<void>;

  async execute(forceDownload = false): Promise<void> {
    if (!forceDownload && !(await this.shouldDownload())) {
      console.log('Data already exists, skipping download. Use --force-download to override.');
      return;
    }

    let page = 1;
    while (true) {
      const url = await this.buildUrl(page, this.pageSize);
      const { data } = await this.httpClient.request(url, {
        headers: { 'chave-api-dados': this.apiKey },
      });
      const items = await this.decodePage(data);

      if (items.length === 0) break;

      console.log(`Fetched page ${page}, records: ${items.length}`);
      await this.onPageFetched(items);

      if (items.length < this.pageSize) break;

      page++;
    }
  }
}
