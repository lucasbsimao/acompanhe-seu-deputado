import axios, { AxiosError, AxiosInstance } from 'axios';
import axiosRetry, { exponentialDelay, retryAfter } from 'axios-retry';

export interface RetryConfig {
  maxRetries: number;
  retryWaitMin: number;
  retryWaitMax: number;
}

export class HttpClient {
  private client: AxiosInstance;

  constructor(private readonly retryConfig: RetryConfig, timeoutMs: number = 4000) {
    this.client = axios.create({
      timeout: timeoutMs,
    });

    axiosRetry(this.client, {
      retries: retryConfig.maxRetries,
      shouldResetTimeout: true,
      retryCondition: (error) => this.shouldRetry(error),
      retryDelay: (retryCount, error) => this.calculateBackoff(retryCount, error),
    });
  }

  async request(
    url: string,
    options?: { headers?: Record<string, string> }
  ): Promise<{ data: unknown; headers: Record<string, string> }> {
    const response = await this.client.get(url, {
      headers: options?.headers,
    });
    return {
      data: response.data,
      headers: response.headers as Record<string, string>,
    };
  }

  private shouldRetry(error: AxiosError): boolean {
    const status = error.response?.status;

    if (status === 429) {
      return true;
    }

    if (status !== undefined) {
      return status >= 500 && status <= 599;
    }

    return axiosRetry.isNetworkOrIdempotentRequestError(error);
  }

  private calculateBackoff(retryCount: number, error: AxiosError): number {
    const serverDelay = retryAfter(error);
    if (serverDelay > 0) {
      return serverDelay;
    }

    const delay = exponentialDelay(retryCount, error, this.retryConfig.retryWaitMin);
    return Math.min(delay, this.retryConfig.retryWaitMax);
  }
}
