import axios, { AxiosInstance } from 'axios';

export interface RetryConfig {
  maxRetries: number;
  retryWaitMin: number;
  retryWaitMax: number;
}

export class HttpClient {
  private client: AxiosInstance;
  private retryConfig: RetryConfig;

  constructor(retryConfig: RetryConfig, timeoutMs: number = 4000) {
    this.retryConfig = retryConfig;
    this.client = axios.create({
      timeout: timeoutMs,
    });
  }

  async request(url: string): Promise<{ data: unknown; headers: Record<string, string> }> {
    let attempt = 0;

    while (true) {
      try {
        const response = await this.client.get(url);
        return {
          data: response.data,
          headers: response.headers as Record<string, string>,
        };
      } catch (err) {
        const shouldRetry = this.shouldRetry(err);
        const isMaxRetriesReached = attempt >= this.retryConfig.maxRetries;

        if (!shouldRetry || isMaxRetriesReached) {
          throw err;
        }

        const waitTime = this.calculateBackoff(err, attempt);
        await this.sleep(waitTime);
        attempt++;
      }
    }
  }

  private shouldRetry(err: unknown): boolean {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;

      if (status === 429 || status === 503) {
        return true;
      }

      if (status && status >= 500 && status <= 599) {
        return true;
      }

      if (err.code === 'ECONNABORTED' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
        return true;
      }
    }

    if (err instanceof Error && err.message.includes('timeout')) {
      return true;
    }

    return true;
  }

  private calculateBackoff(err: unknown, attempt: number): number {
    if (axios.isAxiosError(err) && err.response) {
      const retryAfter = err.response.headers['retry-after'];
      if (retryAfter) {
        const seconds = parseInt(retryAfter as string, 10);
        if (!isNaN(seconds) && seconds > 0) {
          return seconds * 1000;
        }
      }
    }

    const exponentialBackoff = this.retryConfig.retryWaitMin * Math.pow(2, attempt);
    const capped = Math.min(exponentialBackoff, this.retryConfig.retryWaitMax);
    return capped;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
