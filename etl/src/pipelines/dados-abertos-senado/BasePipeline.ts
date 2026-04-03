import { HttpClient } from '../../core/HttpClient';
import defaultConfig from '../../config/defaults.json';

export interface SenadoConfig {
  maxRetries?: number;
  retryWaitMin?: number;
  retryWaitMax?: number;
  timeoutMs?: number;
}

export abstract class BasePipeline<T> {
  protected httpClient: HttpClient;

  constructor(config: SenadoConfig = {}) {
    this.httpClient = new HttpClient(
      {
        maxRetries: config.maxRetries ?? defaultConfig.pagination.maxRetries,
        retryWaitMin: config.retryWaitMin ?? defaultConfig.pagination.retryWaitMin,
        retryWaitMax: config.retryWaitMax ?? defaultConfig.pagination.retryWaitMax,
      },
      config.timeoutMs ?? defaultConfig.pagination.timeoutMs
    );
  }

  abstract buildUrl(): Promise<string>;
  abstract decodePage(data: unknown): Promise<T[]>;
  abstract shouldDownload(): Promise<boolean>;
  abstract onPageFetched(items: T[]): Promise<void>;

  async execute(forceDownload = false): Promise<void> {
    if (!forceDownload && !(await this.shouldDownload())) {
      console.log('Data already exists, skipping download. Use --force-download to override.');
      return;
    }

    const url = await this.buildUrl();
    const { data } = await this.httpClient.request(url);
    const items = await this.decodePage(data);
    
    console.log('Total records:', items.length);
    await this.onPageFetched(items);
  }
}
