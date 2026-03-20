import * as assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { JsonArrayStreamWriter } from '../core/JsonArrayStreamWriter';

const TEST_OUTPUT_DIR = path.join(os.tmpdir(), 'etl-stream-writer-tests');

function setupTestOutputDir(): void {
  if (!fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  }
}

function cleanupTestOutputDir(): void {
  if (fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
  }
}

describe('JsonArrayStreamWriter Unit Tests', () => {
  beforeEach(() => {
    setupTestOutputDir();
  });

  afterEach(() => {
    cleanupTestOutputDir();
  });

  it('should create an empty JSON array when no items are written', async () => {
    const outputFile = path.join(TEST_OUTPUT_DIR, 'empty.json');
    const writer = new JsonArrayStreamWriter(outputFile);

    await writer.open();
    await writer.close();

    assert.ok(fs.existsSync(outputFile), 'Output file should be created');
    const content = fs.readFileSync(outputFile, 'utf8');
    assert.strictEqual(content, '[]', 'Content should be an empty JSON array');
  });

  it('should write a single item', async () => {
    const outputFile = path.join(TEST_OUTPUT_DIR, 'single-item.json');
    const writer = new JsonArrayStreamWriter<{ id: number; name: string }>(outputFile);

    await writer.open();
    await writer.writeItems([{ id: 1, name: 'Item 1' }]);
    await writer.close();

    const content = fs.readFileSync(outputFile, 'utf8');
    const parsed = JSON.parse(content);

    assert.ok(Array.isArray(parsed), 'Content should be an array');
    assert.strictEqual(parsed.length, 1, 'Array should contain 1 item');
    assert.deepStrictEqual(parsed[0], { id: 1, name: 'Item 1' });
  });

  it('should write multiple items in a single batch', async () => {
    const outputFile = path.join(TEST_OUTPUT_DIR, 'multiple-items.json');
    const writer = new JsonArrayStreamWriter<{ id: number }>(outputFile);

    const items = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }));

    await writer.open();
    await writer.writeItems(items);
    await writer.close();

    const content = fs.readFileSync(outputFile, 'utf8');
    const parsed = JSON.parse(content);

    assert.strictEqual(parsed.length, 10, 'Array should contain 10 items');
    for (let i = 0; i < 10; i++) {
      assert.strictEqual(parsed[i].id, i + 1, `Item ${i} should have correct id`);
    }
  });

  it('should write items across multiple batches', async () => {
    const outputFile = path.join(TEST_OUTPUT_DIR, 'multiple-batches.json');
    const writer = new JsonArrayStreamWriter<{ batch: number; id: number }>(outputFile);

    await writer.open();
    await writer.writeItems([{ batch: 1, id: 1 }, { batch: 1, id: 2 }]);
    await writer.writeItems([{ batch: 2, id: 3 }, { batch: 2, id: 4 }]);
    await writer.writeItems([{ batch: 3, id: 5 }]);
    await writer.close();

    const content = fs.readFileSync(outputFile, 'utf8');
    const parsed = JSON.parse(content);

    assert.strictEqual(parsed.length, 5, 'Array should contain 5 items');
    assert.strictEqual(parsed[0].batch, 1);
    assert.strictEqual(parsed[2].batch, 2);
    assert.strictEqual(parsed[4].batch, 3);
  });

  it('should handle large batches', async () => {
    const outputFile = path.join(TEST_OUTPUT_DIR, 'large-batch.json');
    const writer = new JsonArrayStreamWriter<{ id: number }>(outputFile);

    const items = Array.from({ length: 1000 }, (_, i) => ({ id: i + 1 }));

    await writer.open();
    await writer.writeItems(items);
    await writer.close();

    const content = fs.readFileSync(outputFile, 'utf8');
    const parsed = JSON.parse(content);

    assert.strictEqual(parsed.length, 1000, 'Array should contain 1000 items');
    assert.strictEqual(parsed[0].id, 1);
    assert.strictEqual(parsed[999].id, 1000);
  });

  it('should throw error when writing to closed stream', async () => {
    const outputFile = path.join(TEST_OUTPUT_DIR, 'write-after-close.json');
    const writer = new JsonArrayStreamWriter<{ id: number }>(outputFile);

    await writer.open();
    await writer.close();

    await assert.rejects(
      async () => await writer.writeItems([{ id: 1 }]),
      (error: any) => {
        assert.ok(error.message.includes('closed'), 'Error should mention stream is closed');
        return true;
      },
      'Should throw error when writing to closed stream'
    );
  });

  it('should throw error when writing without opening stream', async () => {
    const outputFile = path.join(TEST_OUTPUT_DIR, 'write-without-open.json');
    const writer = new JsonArrayStreamWriter<{ id: number }>(outputFile);

    await assert.rejects(
      async () => await writer.writeItems([{ id: 1 }]),
      (error: any) => {
        assert.ok(error.message.includes('not open'), 'Error should mention stream is not open');
        return true;
      },
      'Should throw error when writing without opening stream'
    );
  });

  it('should handle closing multiple times gracefully', async () => {
    const outputFile = path.join(TEST_OUTPUT_DIR, 'multiple-close.json');
    const writer = new JsonArrayStreamWriter<{ id: number }>(outputFile);

    await writer.open();
    await writer.writeItems([{ id: 1 }]);
    await writer.close();
    await writer.close();

    const content = fs.readFileSync(outputFile, 'utf8');
    const parsed = JSON.parse(content);
    assert.strictEqual(parsed.length, 1);
  });

  it('should create valid JSON with special characters', async () => {
    const outputFile = path.join(TEST_OUTPUT_DIR, 'special-chars.json');
    const writer = new JsonArrayStreamWriter<{ text: string }>(outputFile);

    await writer.open();
    await writer.writeItems([
      { text: 'Hello "World"' },
      { text: 'Line\nBreak' },
      { text: 'Tab\tCharacter' },
      { text: 'Backslash\\Path' },
    ]);
    await writer.close();

    const content = fs.readFileSync(outputFile, 'utf8');
    const parsed = JSON.parse(content);

    assert.strictEqual(parsed.length, 4);
    assert.strictEqual(parsed[0].text, 'Hello "World"');
    assert.strictEqual(parsed[1].text, 'Line\nBreak');
    assert.strictEqual(parsed[2].text, 'Tab\tCharacter');
    assert.strictEqual(parsed[3].text, 'Backslash\\Path');
  });

  it('should handle unicode characters', async () => {
    const outputFile = path.join(TEST_OUTPUT_DIR, 'unicode.json');
    const writer = new JsonArrayStreamWriter<{ text: string }>(outputFile);

    await writer.open();
    await writer.writeItems([
      { text: '你好世界' },
      { text: 'Olá Mundo' },
      { text: '🚀 Rocket' },
    ]);
    await writer.close();

    const content = fs.readFileSync(outputFile, 'utf8');
    const parsed = JSON.parse(content);

    assert.strictEqual(parsed.length, 3);
    assert.strictEqual(parsed[0].text, '你好世界');
    assert.strictEqual(parsed[1].text, 'Olá Mundo');
    assert.strictEqual(parsed[2].text, '🚀 Rocket');
  });
});
