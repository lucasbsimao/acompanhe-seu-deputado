import * as assert from 'node:assert';
import { describe, it } from 'node:test';
import { normalizeNameForMatching } from '../../src/util/normalization.util';

describe('normalizeNameForMatching', () => {
  it('should convert to uppercase', () => {
    assert.strictEqual(normalizeNameForMatching('João Silva'), 'JOAO SILVA');
  });

  it('should remove accents', () => {
    assert.strictEqual(normalizeNameForMatching('José María'), 'JOSE MARIA');
  });

  it('should handle complex names with multiple accents', () => {
    assert.strictEqual(normalizeNameForMatching('Dr. Zacharias Calil'), 'DR. ZACHARIAS CALIL');
  });

  it('should match API autor format', () => {
    assert.strictEqual(normalizeNameForMatching('Dr Flávio'), 'DR FLAVIO');
  });

  it('should handle names with ç', () => {
    assert.strictEqual(normalizeNameForMatching('André França'), 'ANDRE FRANCA');
  });

  it('should handle empty string', () => {
    assert.strictEqual(normalizeNameForMatching(''), '');
  });
});
