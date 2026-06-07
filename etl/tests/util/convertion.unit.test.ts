import * as assert from 'node:assert';
import { describe, it } from 'node:test';
import { convertToCents } from '../../src/util/convertion.util';

describe('convertToCents', () => {
  it('should convert zero to zero', () => {
    assert.strictEqual(convertToCents(0), 0);
  });

  it('should convert sub-100 values correctly (regression: was returning raw value)', () => {
    assert.strictEqual(convertToCents(40.0), 4000);
    assert.strictEqual(convertToCents(1.0), 100);
    assert.strictEqual(convertToCents(99.99), 9999);
  });

  it('should convert values >= 100 correctly', () => {
    assert.strictEqual(convertToCents(100.0), 10000);
    assert.strictEqual(convertToCents(150.5), 15050);
    assert.strictEqual(convertToCents(1234.56), 123456);
  });

  it('should round fractional cents', () => {
    assert.strictEqual(convertToCents(0.005), 1);
    assert.strictEqual(convertToCents(10.999), 1100);
  });
});
