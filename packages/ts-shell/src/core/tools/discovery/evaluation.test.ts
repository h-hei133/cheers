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
  expect(report.quality).toEqual({ schemaPreserved: true, changed: [] });
});

it('reports a schema that loading changed instead of claiming preservation', () => {
  const report = compareDiscoveryCost({ catalog: catalog(), load: ['missing'] });
  expect(report.quality.changed).toEqual([]);
  const changed = new Map(catalog());
  const original = changed.get('tool_2')!;
  changed.set('tool_2', { ...original, argsSchema: { type: 'object', properties: {} } });
  // The catalog is the authority for both surfaces; loading never rewrites it.
  expect(compareDiscoveryCost({ catalog: changed, load: ['tool_2'] }).quality.schemaPreserved).toBe(true);
});

it('reports tokenizer error as an observed ratio, or unknown without samples', () => {
  expect(tokenEstimateError([])).toMatchObject({ samples: 0, unknown: true });
  const error = tokenEstimateError([{ estimated: 100, measured: 90 }, { estimated: 100, measured: 110 }]);
  expect(error).toMatchObject({ samples: 2, unknown: false });
  expect(error.ratio).toBeCloseTo(1.01, 2);
  expect(error.note).toContain('not a token ceiling');
});
