import { HttpClient } from './HttpClient';
import { JsonArrayStreamWriter } from './JsonArrayStreamWriter';

export interface RetryConfig {
  maxRetries: number;
  retryWaitMin: number;
  retryWaitMax: number;
}

export interface PaginationConfig {
  pageSize?: number;
  parallelism?: number;
  maxRetries?: number;
  retryWaitMin?: number;
  retryWaitMax?: number;
  fileName: string;
}


export abstract class PaginationEngine<T> {
  protected httpClient: HttpClient;
  protected streamWriter: JsonArrayStreamWriter<T>;
  protected pageSize: number;
  protected parallelism: number;

  constructor(config: PaginationConfig) {
    const normalizedConfig = this.normalizeConfig(config);
    
    this.pageSize = normalizedConfig.pageSize;
    this.parallelism = normalizedConfig.parallelism;
    
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

  async execute(): Promise<void> {
    try {
      await this.streamWriter.open();

      const { items: firstItems, totalPages } = await this.fetchFirstPage();
      await this.streamWriter.writeItems(firstItems);

      if (totalPages > 1) {
        await this.fetchRemainingPages(totalPages);
      }
    } finally {
      await this.streamWriter.close();
    }
  }

  private async fetchFirstPage(): Promise<{ items: T[]; totalPages: number }> {
    const url = await this.buildUrl(1, this.pageSize);
    const { data, headers } = await this.httpClient.request(url);

    const totalCount = await this.extractTotalCount(headers);
    const totalPages = Math.ceil(totalCount / this.pageSize);
    console.log('Total records:', totalCount);
    console.log('Total pages:', totalPages);

    const items = await this.decodePage(data);
    return { items, totalPages };
  }

  private async fetchRemainingPages(totalPages: number): Promise<void> {
    const pageNumbers = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
    const pageMap = new Map<number, T[]>();

    for (let i = 0; i < pageNumbers.length; i += this.parallelism) {
      const batch = pageNumbers.slice(i, i + this.parallelism);
      const results = await Promise.all(
        batch.map(async (page) => {
          const url = await this.buildUrl(page, this.pageSize);
          const { data } = await this.httpClient.request(url);
          const items = await this.decodePage(data);
          return { page, items };
        })
      );
      results.forEach((r) => pageMap.set(r.page, r.items));
    }

    for (let page = 2; page <= totalPages; page++) {
      const items = pageMap.get(page);
      if (items) {
        console.log(`Fetched page: ${page}, records: ${items.length}`);
        await this.streamWriter.writeItems(items);
      }
    }
  }


  private normalizeConfig(cfg: PaginationConfig): Required<PaginationConfig> {
    return {
      fileName: cfg.fileName,
      pageSize: cfg.pageSize && cfg.pageSize > 0 ? cfg.pageSize : 100,
      parallelism: cfg.parallelism && cfg.parallelism > 0 ? cfg.parallelism : 4,
      maxRetries: cfg.maxRetries !== undefined && cfg.maxRetries >= 0 ? cfg.maxRetries : 3,
      retryWaitMin: cfg.retryWaitMin && cfg.retryWaitMin > 0 ? cfg.retryWaitMin : 250,
      retryWaitMax: cfg.retryWaitMax && cfg.retryWaitMax > 0 ? cfg.retryWaitMax : 2000,
    };
  }
}
