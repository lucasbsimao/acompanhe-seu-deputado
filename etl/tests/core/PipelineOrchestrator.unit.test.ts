import * as assert from 'node:assert';
import { describe, it, mock, afterEach } from 'node:test';
import { PipelineOrchestrator } from '../../src/core/PipelineOrchestrator';
import type { PipelineInfo } from '../../src/types/Pipeline';
import type Database from 'better-sqlite3';

type PipelineOrchestratorWithPrivates = {
  resolveExecutionOrder(pipelines: PipelineInfo[]): PipelineInfo[];
};

function makeInfo(className: string, dependencies: string[]): PipelineInfo {
  return {
    name: className,
    displayName: className,
    className,
    filePath: '',
    importPath: className,
    dependencies,
  };
}

function makeFakeClass(log: { importPath: string; forceDownload: boolean }[], importPath: string) {
  return class {
    constructor(_db: unknown) {
      void _db;
    }
    static readonly dependencies: readonly string[] = [];
    execute(forceDownload: boolean): Promise<void> {
      log.push({ importPath, forceDownload });
      return Promise.resolve();
    }
  };
}

describe('PipelineOrchestrator.executeAll', () => {
  afterEach(() => {
    mock.reset();
  });

  // Graph: D ← B ← A → C ← D  (diamond), then E depends on A
  //        D has no deps; B and C both depend on D; A depends on B+C; E depends on A
  it('runs a diamond + chain graph in dependency order and passes forceDownload to each', async () => {
    const orchestrator = new PipelineOrchestrator(null as unknown as Database.Database);
    const log: { importPath: string; forceDownload: boolean }[] = [];

    mock.method(orchestrator, 'loadPipelineClass', (importPath: string) =>
      Promise.resolve(makeFakeClass(log, importPath)),
    );

    const d = makeInfo('D', []);
    const b = makeInfo('B', ['D']);
    const c = makeInfo('C', ['D']);
    const a = makeInfo('A', ['B', 'C']);
    const e = makeInfo('E', ['A']);
    await orchestrator.executeAll([e, a, b, c, d], true);

    const names = log.map(entry => entry.importPath);
    assert.strictEqual(names.length, 5);
    assert.ok(names.indexOf('D') < names.indexOf('B'), 'D before B');
    assert.ok(names.indexOf('D') < names.indexOf('C'), 'D before C');
    assert.ok(names.indexOf('B') < names.indexOf('A'), 'B before A');
    assert.ok(names.indexOf('C') < names.indexOf('A'), 'C before A');
    assert.ok(names.indexOf('A') < names.indexOf('E'), 'A before E');
    assert.ok(log.every(entry => entry.forceDownload));
  });
});

describe('PipelineOrchestrator.executeSelected', () => {
  afterEach(() => {
    mock.reset();
  });

  // Graph: D ← B ← A → C ← D  (diamond A depends on B+C, both depend on D); F is unrelated
  // Select A: must run D, B, C (forceDownload=false) then A (forceDownload=true); F must not run
  it('runs only target + transitive deps; deps use forceDownload=false, target uses given flag', async () => {
    const orchestrator = new PipelineOrchestrator(null as unknown as Database.Database);
    const log: { importPath: string; forceDownload: boolean }[] = [];

    mock.method(orchestrator, 'loadPipelineClass', (importPath: string) =>
      Promise.resolve(makeFakeClass(log, importPath)),
    );

    const d = makeInfo('D', []);
    const b = makeInfo('B', ['D']);
    const c = makeInfo('C', ['D']);
    const a = makeInfo('A', ['B', 'C']);
    const f = makeInfo('F', []); // unrelated — must not run

    await orchestrator.executeSelected([a, b, c, d, f], 'A', true);

    const names = log.map(entry => entry.importPath);
    assert.ok(!names.includes('F'), 'F must not run');
    assert.strictEqual(names.length, 4);
    assert.ok(names.indexOf('D') < names.indexOf('B'), 'D before B');
    assert.ok(names.indexOf('D') < names.indexOf('C'), 'D before C');
    assert.ok(names.indexOf('B') < names.indexOf('A'), 'B before A');
    assert.ok(names.indexOf('C') < names.indexOf('A'), 'C before A');
    assert.ok(
      log.filter(e => e.importPath !== 'A').every(e => !e.forceDownload),
      'deps run with forceDownload=false',
    );
    const aEntry = log.find(e => e.importPath === 'A');
    assert.ok(aEntry, 'entry A should exist in log');
    assert.strictEqual(aEntry.forceDownload, true);
  });

  it('throws when selected class name is not found', async () => {
    const orchestrator = new PipelineOrchestrator(null as unknown as Database.Database);

    await assert.rejects(
      () => orchestrator.executeSelected([makeInfo('A', [])], 'NonExistent', false),
      /Pipeline NonExistent not found/,
    );
  });
});

describe('PipelineOrchestrator.resolveExecutionOrder', () => {
  it('linear chain: A→B→C sorts as [C, B, A]', () => {
    const c = makeInfo('C', []);
    const b = makeInfo('B', ['C']);
    const a = makeInfo('A', ['B']);

    const result = (
      PipelineOrchestrator as unknown as PipelineOrchestratorWithPrivates
    ).resolveExecutionOrder([a, b, c]);

    assert.deepStrictEqual(
      result.map((p: PipelineInfo) => p.className),
      ['C', 'B', 'A'],
    );
  });

  it('diamond: D appears before B and C; B and C before A', () => {
    const d = makeInfo('D', []);
    const b = makeInfo('B', ['D']);
    const c = makeInfo('C', ['D']);
    const a = makeInfo('A', ['B', 'C']);

    const result: PipelineInfo[] = (
      PipelineOrchestrator as unknown as PipelineOrchestratorWithPrivates
    ).resolveExecutionOrder([a, b, c, d]);
    const names = result.map(p => p.className);

    assert.ok(names.indexOf('D') < names.indexOf('B'), 'D must come before B');
    assert.ok(names.indexOf('D') < names.indexOf('C'), 'D must come before C');
    assert.ok(names.indexOf('B') < names.indexOf('A'), 'B must come before A');
    assert.ok(names.indexOf('C') < names.indexOf('A'), 'C must come before A');
  });

  it('no dependencies: order is stable (same as input)', () => {
    const pipelines = [makeInfo('X', []), makeInfo('Y', []), makeInfo('Z', [])];

    const result = (
      PipelineOrchestrator as unknown as PipelineOrchestratorWithPrivates
    ).resolveExecutionOrder(pipelines);

    assert.deepStrictEqual(
      result.map((p: PipelineInfo) => p.className),
      ['X', 'Y', 'Z'],
    );
  });

  it('cycle detection: throws Error with "Circular dependency detected"', () => {
    const a = makeInfo('A', ['B']);
    const b = makeInfo('B', ['A']);

    assert.throws(
      () =>
        (PipelineOrchestrator as unknown as PipelineOrchestratorWithPrivates).resolveExecutionOrder(
          [a, b],
        ),
      (err: Error) => {
        assert.ok(err.message.includes('Circular dependency detected'), err.message);
        return true;
      },
    );
  });

  it('unknown dependency: throws Error with "Unknown dependency"', () => {
    const a = makeInfo('A', ['NonExistent']);

    assert.throws(
      () =>
        (PipelineOrchestrator as unknown as PipelineOrchestratorWithPrivates).resolveExecutionOrder(
          [a],
        ),
      (err: Error) => {
        assert.ok(err.message.includes('Unknown dependency'), err.message);
        return true;
      },
    );
  });
});
