import { expect, it } from 'vitest';
import { toolsReport } from './report.js';
import type { ToolDefinition } from '../../../tools/types.js';

const tool = (name: string, description: string, argsSchema: Record<string, unknown>): ToolDefinition =>
  ({ name, description, argsSchema, execute: async () => ({ success: true, output: '' }) });

it('reports static description and schema bytes without claiming a token count', () => {
  const report = toolsReport(new Map([
    ['a', tool('a', 'first', { type: 'object' })],
    ['b', tool('b', 'second', { type: 'object', properties: { x: { type: 'string' } } })],
  ]));
  const size = report.facts.size as { unit: string; tokens: string; descriptionBytes: number; schemaBytes: number; perTool: { name: string }[] };
  expect(size.unit).toBe('utf8-bytes');
  expect(size.tokens).toBe('not-measured');
  expect(size.descriptionBytes).toBe(Buffer.byteLength('first') + Buffer.byteLength('second'));
  expect(size.schemaBytes).toBeGreaterThan(size.descriptionBytes);
  expect(size.perTool.map(entry => entry.name)).toEqual(['a', 'b']);
});
