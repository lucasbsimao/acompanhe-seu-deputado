import { HttpClient } from './HttpClient';
import { JsonArrayStreamWriter } from './JsonArrayStreamWriter';

export interface RetryConfig {
  maxRetries: number;
  retryWaitMin: number;
  retryWaitMax: number;
}

export interface PaginationConfig {
  pageSize?: number;
  workers?: number;
  maxRetries?: number;
  retryWaitMin?: number;
  retryWaitMax?: number;
  fileName: string;
}

export interface PageResult<T> {
  page: number;
  items: T[];
  error?: Error;
}

export abstract class PaginationEngine<T> {
  protected httpClient: HttpClient;
  protected streamWriter: JsonArrayStreamWriter<T>;
  protected pageSize: number;
  protected workers: number;

  constructor(config: PaginationConfig) {
    const normalizedConfig = this.normalizeConfig(config);
    
    this.pageSize = normalizedConfig.pageSize;
    this.workers = normalizedConfig.workers;
    
    this.httpClient = new HttpClient(
      {
        maxRetries: normalizedConfig.maxRetries,
        retryWaitMin: normalizedConfig.retryWaitMin,
        retryWaitMax: normalizedConfig.retryWaitMax,
      },
      4000
    );
    this.streamWriter = new JsonArrayStreamWriter(config.fileName);
  }

  abstract buildUrl(page: number, pageSize: number): Promise<string>;
  abstract decodePage(data: unknown): Promise<T[]>;
  abstract extractTotalCount(headers: Record<string, string>): Promise<number>;

  async execute(signal?: AbortSignal): Promise<void> {
    try {
      await this.streamWriter.open();

      const { items: firstItems, totalPages } = await this.fetchFirstPage(signal);
      await this.streamWriter.writeItems(firstItems);

      if (totalPages > 1) {
        await this.fetchRemainingPages(totalPages, signal);
      }
    } finally {
      await this.streamWriter.close();
    }
  }

  private async fetchFirstPage(signal?: AbortSignal): Promise<{ items: T[]; totalPages: number }> {
    const url = await this.buildUrl(1, this.pageSize);
    const { data, headers } = await this.httpClient.request(url, signal);

    const totalCount = await this.extractTotalCount(headers);
    const totalPages = Math.ceil(totalCount / this.pageSize);
    console.log('Total records:', totalCount);
    console.log('Total pages:', totalPages);

    const items = await this.decodePage(data);
    return { items, totalPages };
  }

  private async fetchRemainingPages(totalPages: number, signal?: AbortSignal): Promise<void> {
    const pageMap = new Map<number, T[]>();
    const jobs: number[] = [];

    for (let page = 2; page <= totalPages; page++) {
      jobs.push(page);
    }

    const results = await this.processJobsInParallel(jobs, signal);

    for (const result of results) {
      if (result.error) {
        throw new Error(`Error fetching page ${result.page}: ${result.error.message}`);
      }
      pageMap.set(result.page, result.items);
    }

    for (let page = 2; page <= totalPages; page++) {
      const items = pageMap.get(page);
      if (items) {
        console.log(`Fetched page: ${page}, records: ${items.length}`);
        await this.streamWriter.writeItems(items);
      }
    }
  }

  private async processJobsInParallel(jobs: number[], signal?: AbortSignal): Promise<PageResult<T>[]> {
    const results: PageResult<T>[] = [];
    const activeWorkers: Promise<void>[] = [];
    let jobIndex = 0;

    const worker = async () => {
      while (jobIndex < jobs.length) {
        if (signal?.aborted) {
          throw new Error('Aborted');
        }

        const page = jobs[jobIndex];
        jobIndex++;

        try {
          const url = await this.buildUrl(page, this.pageSize);
          const { data } = await this.httpClient.request(url, signal);
          const items = await this.decodePage(data);
          results.push({ page, items });
        } catch (error) {
          results.push({
            page,
            items: [],
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      }
    };

    for (let i = 0; i < this.workers; i++) {
      activeWorkers.push(worker());
    }

    await Promise.all(activeWorkers);
    return results.sort((a, b) => a.page - b.page);
  }

  private normalizeConfig(cfg: PaginationConfig): Required<PaginationConfig> {
    return {
      fileName: cfg.fileName,
      pageSize: cfg.pageSize && cfg.pageSize > 0 ? cfg.pageSize : 100,
      workers: cfg.workers && cfg.workers > 0 ? cfg.workers : 4,
      maxRetries: cfg.maxRetries !== undefined && cfg.maxRetries >= 0 ? cfg.maxRetries : 0,
      retryWaitMin: cfg.retryWaitMin && cfg.retryWaitMin > 0 ? cfg.retryWaitMin : 250,
      retryWaitMax: cfg.retryWaitMax && cfg.retryWaitMax > 0 ? cfg.retryWaitMax : 2000,
    };
  }
}
