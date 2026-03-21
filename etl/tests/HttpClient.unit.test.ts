import * as assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import nock from 'nock';
import { HttpClient } from '../src/core/HttpClient';

const TEST_BASE_URL = 'https://api.example.com';

describe('HttpClient Unit Tests', () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should make successful GET request', async () => {
    const mockData = { message: 'success', data: [1, 2, 3] };

    nock(TEST_BASE_URL)
      .get('/endpoint')
      .reply(200, mockData, { 'x-custom-header': 'value' });

    const client = new HttpClient(
      { maxRetries: 3, retryWaitMin: 100, retryWaitMax: 1000 },
      5000
    );

    const result = await client.request(`${TEST_BASE_URL}/endpoint`);

    assert.deepStrictEqual(result.data, mockData);
    assert.strictEqual(result.headers['x-custom-header'], 'value');
    assert.ok(nock.isDone(), 'HTTP mock should be called');
  });

  it('should retry on 500 errors and succeed', async () => {
    const mockData = { message: 'success' };

    nock(TEST_BASE_URL)
      .get('/endpoint')
      .reply(500, 'Internal Server Error')
      .get('/endpoint')
      .reply(500, 'Internal Server Error')
      .get('/endpoint')
      .reply(200, mockData);

    const client = new HttpClient(
      { maxRetries: 3, retryWaitMin: 50, retryWaitMax: 200 },
      5000
    );

    const result = await client.request(`${TEST_BASE_URL}/endpoint`);

    assert.deepStrictEqual(result.data, mockData);
    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('should retry on 503 Service Unavailable', async () => {
    const mockData = { message: 'success' };

    nock(TEST_BASE_URL)
      .get('/endpoint')
      .reply(503, 'Service Unavailable')
      .get('/endpoint')
      .reply(200, mockData);

    const client = new HttpClient(
      { maxRetries: 3, retryWaitMin: 50, retryWaitMax: 200 },
      5000
    );

    const result = await client.request(`${TEST_BASE_URL}/endpoint`);

    assert.deepStrictEqual(result.data, mockData);
    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('should retry on 429 Rate Limit', async () => {
    const mockData = { message: 'success' };

    nock(TEST_BASE_URL)
      .get('/endpoint')
      .reply(429, 'Too Many Requests')
      .get('/endpoint')
      .reply(200, mockData);

    const client = new HttpClient(
      { maxRetries: 3, retryWaitMin: 50, retryWaitMax: 200 },
      5000
    );

    const result = await client.request(`${TEST_BASE_URL}/endpoint`);

    assert.deepStrictEqual(result.data, mockData);
    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('should respect Retry-After header', async () => {
    const mockData = { message: 'success' };

    nock(TEST_BASE_URL)
      .get('/endpoint')
      .reply(429, 'Too Many Requests', { 'Retry-After': '1' })
      .get('/endpoint')
      .reply(200, mockData);

    const client = new HttpClient(
      { maxRetries: 3, retryWaitMin: 50, retryWaitMax: 200 },
      5000
    );

    const startTime = Date.now();
    const result = await client.request(`${TEST_BASE_URL}/endpoint`);
    const elapsed = Date.now() - startTime;

    assert.deepStrictEqual(result.data, mockData);
    assert.ok(elapsed >= 900, `Should wait at least 900ms for Retry-After, waited ${elapsed}ms`);
    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('should fail after exhausting retries', async () => {
    nock(TEST_BASE_URL)
      .get('/endpoint')
      .times(4)
      .reply(500, 'Internal Server Error');

    const client = new HttpClient(
      { maxRetries: 3, retryWaitMin: 50, retryWaitMax: 200 },
      5000
    );

    await assert.rejects(
      async () => await client.request(`${TEST_BASE_URL}/endpoint`),
      (error: any) => {
        assert.ok(error.message.includes('500') || error.response?.status === 500);
        return true;
      },
      'Should throw error after exhausting retries'
    );
  });

  it('should not retry on 4xx client errors (except 429)', async () => {
    nock(TEST_BASE_URL)
      .get('/endpoint')
      .reply(404, 'Not Found');

    const client = new HttpClient(
      { maxRetries: 3, retryWaitMin: 50, retryWaitMax: 200 },
      5000
    );

    await assert.rejects(
      async () => await client.request(`${TEST_BASE_URL}/endpoint`),
      (error: any) => {
        assert.strictEqual(error.response?.status, 404);
        return true;
      },
      'Should fail immediately on 404'
    );

    assert.ok(nock.isDone(), 'Should only make one request');
  });

  it('should handle timeout', async () => {
    nock(TEST_BASE_URL)
      .get('/endpoint')
      .delay(2000)
      .reply(200, { message: 'success' });

    const client = new HttpClient(
      { maxRetries: 0, retryWaitMin: 50, retryWaitMax: 200 },
      500
    );

    await assert.rejects(
      async () => await client.request(`${TEST_BASE_URL}/endpoint`),
      (error: any) => {
        assert.ok(error.code === 'ECONNABORTED' || error.message.includes('timeout'));
        return true;
      },
      'Should timeout'
    );
  });

  it('should retry on network errors', async () => {
    const mockData = { message: 'success' };

    nock(TEST_BASE_URL)
      .get('/endpoint')
      .replyWithError({ code: 'ECONNRESET', message: 'Connection reset' })
      .get('/endpoint')
      .reply(200, mockData);

    const client = new HttpClient(
      { maxRetries: 3, retryWaitMin: 50, retryWaitMax: 200 },
      5000
    );

    const result = await client.request(`${TEST_BASE_URL}/endpoint`);

    assert.deepStrictEqual(result.data, mockData);
    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('should use exponential backoff between retries', async () => {
    const mockData = { message: 'success' };
    const retryWaitMin = 100;

    nock(TEST_BASE_URL)
      .get('/endpoint')
      .reply(500, 'Internal Server Error')
      .get('/endpoint')
      .reply(500, 'Internal Server Error')
      .get('/endpoint')
      .reply(200, mockData);

    const client = new HttpClient(
      { maxRetries: 3, retryWaitMin, retryWaitMax: 2000 },
      5000
    );

    const startTime = Date.now();
    const result = await client.request(`${TEST_BASE_URL}/endpoint`);
    const elapsed = Date.now() - startTime;

    assert.deepStrictEqual(result.data, mockData);
    assert.ok(elapsed >= retryWaitMin, `Should wait at least ${retryWaitMin}ms between retries`);
    assert.ok(nock.isDone(), 'All HTTP mocks should be called');
  });

  it('should handle AbortSignal', async () => {
    nock(TEST_BASE_URL)
      .get('/endpoint')
      .delay(1000)
      .reply(200, { message: 'success' });

    const client = new HttpClient(
      { maxRetries: 0, retryWaitMin: 50, retryWaitMax: 200 },
      5000
    );

    const controller = new AbortController();

    setTimeout(() => controller.abort(), 100);

    await assert.rejects(
      async () => await client.request(`${TEST_BASE_URL}/endpoint`, controller.signal),
      (error: any) => {
        assert.ok(error.message.includes('abort') || error.code === 'ERR_CANCELED');
        return true;
      },
      'Should abort request'
    );
  });

  it('should handle successful 2xx responses without retry', async () => {
    for (const status of [200, 201, 204]) {
      nock.cleanAll();

      const mockData = { status: `${status} response` };
      nock(TEST_BASE_URL)
        .get(`/endpoint-${status}`)
        .reply(status, mockData);

      const client = new HttpClient(
        { maxRetries: 3, retryWaitMin: 50, retryWaitMax: 200 },
        5000
      );

      const result = await client.request(`${TEST_BASE_URL}/endpoint-${status}`);
      assert.deepStrictEqual(result.data, mockData);
      assert.ok(nock.isDone(), `Should not retry on ${status}`);
    }
  });
});
