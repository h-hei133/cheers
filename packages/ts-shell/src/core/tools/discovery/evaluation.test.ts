import { expect, it } from 'vitest';
import type { ToolDefinition } from '../../../tools/types.js';
import { compareDiscoveryCost, tokenEstimateError, wireSchema } from './evaluation.js';

function tool(name: string, padding = 100): ToolDefinition {
  return { name, description: `${name} ${'d'.repeat(padding)}`, argsSchema: { type: 'object', properties: { path: { type: 'string', description: 'target' } }, required: ['path'] },
    execute: async () => ({ success: true, output: 'ok' }) };
}
function catalog(count = 30): Map<string, ToolDefinition> {
  return new Map([['read', tool('read')], ['bash', tool('bash')], ...Array.from({ length: count }, (_, index) => [`tool_${index}`, tool(`tool_${index}`)] as const)]);
}

it('measures the wire surface rather than the internal definition', () => {
  const wire = JSON.parse(wireSchema(tool('read')));
  expect(wire).toMatchObject({ type: 'function', function: { name: 'read', parameters: { required: ['path'] } } });
});

it('compares full, initial and post-load surfaces with the discovery cost', () => {
  const report = compareDiscoveryCost({ catalog: catalog(), searches: ['tool_1'], load: ['tool_1'] });
  expect(report.full.tools).toBe(32);
  expect(report.initial.tools).toBe(4); // read, bash, search, load
  expect(report.afterLoad.tools).toBe(5);
  expect(report.discovery.calls).toBe(2);
  expect(report.discovery.bytes).toBeGreaterThan(0);
  expect(report.delta.bytes).toBeGreaterThan(0);
  expect(report.method).toBe('characters-per-token');
  expect(report.divisor).toBe(3.5);
  expect(report.quality).toEqual({ status: 'preserved', changed: [] });
});

it('does not claim schema preservation when no load was requested', () => {
  const report = compareDiscoveryCost({ catalog: catalog() });
  expect(report.quality).toEqual({ status: 'not-measured', changed: [] });
  expect(report.afterLoad).toBeNull();
});

it('does not claim schema preservation for a load that was rejected', () => {
  const report = compareDiscoveryCost({ catalog: catalog(), load: ['missing'] });
  expect(report.quality).toEqual({ status: 'not-measured', changed: [] });
});

it('reports tokenizer error as an observed ratio, or unknown without samples', () => {
  expect(tokenEstimateError([])).toMatchObject({ samples: 0, unknown: true });
  const error = tokenEstimateError([{ estimated: 100, measured: 90 }, { estimated: 100, measured: 110 }]);
  expect(error).toMatchObject({ samples: 2, unknown: false });
  expect(error.ratio).toBeCloseTo(1.01, 2);
  expect(error.bias).toBeCloseTo(0.01, 2);
  expect(error.medianAbsoluteError).toBeGreaterThan(0);
  expect(error.p95AbsoluteError).toBeGreaterThan(0);
  expect(error.ratioInterval).toEqual(expect.objectContaining({ low: expect.any(Number), high: expect.any(Number) }));
  expect(error.note).toContain('not a token ceiling');
});

it('uses code units rather than UTF-8 bytes for the character estimate', () => {
  const chinese = { ...tool('zh', 0), description: '中文说明' };
  const report = compareDiscoveryCost({ catalog: new Map([['zh', chinese]]) });
  expect(report.full.characters).toBeLessThan(report.full.bytes);
  expect(report.full.estimatedTokens).toBeCloseTo(report.full.characters / 3.5, 1);
});
