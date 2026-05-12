import * as assert from 'node:assert';
import { describe, it } from 'node:test';
import { PipelineOrchestrator } from '../../src/core/PipelineOrchestrator';
import { PipelineInfo } from '../../src/types/Pipeline';

function makeInfo(className: string, dependencies: string[]): PipelineInfo {
  return { name: className, displayName: className, className, filePath: '', importPath: '', dependencies };
}

describe('PipelineOrchestrator.resolveExecutionOrder', () => {
  it('linear chain: A→B→C sorts as [C, B, A]', () => {
    const c = makeInfo('C', []);
    const b = makeInfo('B', ['C']);
    const a = makeInfo('A', ['B']);

    const result = (PipelineOrchestrator as any).resolveExecutionOrder([a, b, c]);

    assert.deepStrictEqual(
      result.map((p: PipelineInfo) => p.className),
      ['C', 'B', 'A']
    );
  });

  it('diamond: D appears before B and C; B and C before A', () => {
    const d = makeInfo('D', []);
    const b = makeInfo('B', ['D']);
    const c = makeInfo('C', ['D']);
    const a = makeInfo('A', ['B', 'C']);

    const result: PipelineInfo[] = (PipelineOrchestrator as any).resolveExecutionOrder([a, b, c, d]);
    const names = result.map((p) => p.className);

    assert.ok(names.indexOf('D') < names.indexOf('B'), 'D must come before B');
    assert.ok(names.indexOf('D') < names.indexOf('C'), 'D must come before C');
    assert.ok(names.indexOf('B') < names.indexOf('A'), 'B must come before A');
    assert.ok(names.indexOf('C') < names.indexOf('A'), 'C must come before A');
  });

  it('no dependencies: order is stable (same as input)', () => {
    const pipelines = [makeInfo('X', []), makeInfo('Y', []), makeInfo('Z', [])];

    const result = (PipelineOrchestrator as any).resolveExecutionOrder(pipelines);

    assert.deepStrictEqual(
      result.map((p: PipelineInfo) => p.className),
      ['X', 'Y', 'Z']
    );
  });

  it('cycle detection: throws Error with "Circular dependency detected"', () => {
    const a = makeInfo('A', ['B']);
    const b = makeInfo('B', ['A']);

    assert.throws(
      () => (PipelineOrchestrator as any).resolveExecutionOrder([a, b]),
      (err: Error) => {
        assert.ok(err.message.includes('Circular dependency detected'), err.message);
        return true;
      }
    );
  });

  it('unknown dependency: throws Error with "Unknown dependency"', () => {
    const a = makeInfo('A', ['NonExistent']);

    assert.throws(
      () => (PipelineOrchestrator as any).resolveExecutionOrder([a]),
      (err: Error) => {
        assert.ok(err.message.includes('Unknown dependency'), err.message);
        return true;
      }
    );
  });
});
