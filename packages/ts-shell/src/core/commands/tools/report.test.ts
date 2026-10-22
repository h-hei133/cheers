import { expect, it } from 'vitest';
import { toolReport, toolsReport, toolSummary } from './report.js';
import { reportText } from '../report/projection.js';
import type { ToolDefinition } from '../../../tools/types.js';

const tool = (name: string, description: string, argsSchema: Record<string, unknown>): ToolDefinition =>
  ({ name, description, argsSchema, execute: async () => ({ success: true, output: '' }) });

it.each(['file', 'fi\x1b[31mle'])('scrubs decoded file URL controls before redaction: %s', protocol => {
  const raw = `${protocol}:///fixture/sk-%C2%9B31msynthetic-sensitive`;
  const item = tool(raw, raw, { type: 'object' });
  for (const report of [toolReport(item, '/fixture'), toolsReport(new Map([[raw, item]]), '/fixture')]) {
    expect(JSON.stringify(report)).not.toContain('synthetic-sensitive');
    expect(reportText(report)).not.toContain('synthetic-sensitive');
  }
});

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
  const text = reportText(report);
  expect(text).toContain('Description bytes');
  expect(text).toContain('Schema bytes');
  expect(text).toContain('Token counts require the target model tokenizer and are not measured here.');
  expect(text).toContain('Discovery projection: full');
  expect(report.facts.size).toMatchObject({ discovery: { method: 'characters-per-token', divisor: 3.5,
    qualityStatus: 'not-measured', changed: [] } });
});

it('shows one tool payload size without claiming a wire or token count', () => {
  const report = toolReport(tool('a', 'first', { type: 'object', properties: { x: { type: 'string' } } }));
  const text = reportText(report);
  expect(text).toContain('Description + schema payload: 5 description bytes');
  expect(text).toContain('Token count: not measured.');
});

it('redacts all detail metadata before creating text and persisted facts while measuring original bytes', () => {
  const description = 'Read a note.\nAuthorization:\nBearer synthetic-sensitive-description\nKeep this line.';
  const name = 'api_key=synthetic-sensitive-name';
  const argument = 'token=synthetic-sensitive-argument';
  const schema = { type: 'object', properties: { [argument]: { type: 'string', description: 'password=synthetic-sensitive-field' } }, required: [argument] };
  const item = tool(name, description, schema); const original = JSON.stringify({ name, description, schema });
  const report = toolReport(item);
  expect(JSON.stringify(report)).not.toContain('synthetic-sensitive');
  expect(reportText(report)).toContain('Keep this line.');
  expect(report.facts).toMatchObject({ permission: 'not-evaluated', arguments: [{ required: true, type: 'string' }],
    size: { descriptionBytes: Buffer.byteLength(description), schemaBytes: Buffer.byteLength(JSON.stringify(schema)) } });
  expect(JSON.stringify({ name: item.name, description: item.description, schema: item.argsSchema })).toBe(original);
});

it('redacts a complete description before shortening the list summary', () => {
  const description = `${'x'.repeat(100)} sk-synthetic-sensitive-description`;
  expect(toolSummary(description)).not.toContain('sk-synt');
  const report = toolsReport(new Map([['local', tool('local', description, { type: 'object' })]]));
  expect(JSON.stringify(report)).not.toContain('sk-synt');
  expect(report.facts.size).toMatchObject({ descriptionBytes: Buffer.byteLength(description) });
});

it('removes terminal sequences before redacting metadata and retains the original policy identity', () => {
  const key = 'sk-synthetic-sensitive-sequence';
  const split = key.replace('sk-', 'sk-\x1b[31m');
  const item = { ...tool('mcp__notes__Read', `Read ${split}.`, { type: 'object',
    properties: { [`api_key=synthetic-\x1b[32msensitive-field`]: { type: 'string', description: `Value ${split}` } } }),
    mcpAnnotations: { readOnlyHint: true } };
  const detail = toolReport(item); const listing = toolsReport(new Map([[item.name, item]]));
  expect(JSON.stringify([detail, listing])).not.toContain('synthetic-sensitive');
  expect(toolSummary(item.description)).not.toContain(key);
  expect(detail.facts.planMode).toBe('allowed');
  expect(detail.facts.size).toMatchObject({ descriptionBytes: Buffer.byteLength(item.description) });
});

it('retains CRLF description lines while measuring their original bytes', () => {
  const description = 'Read a note.\r\nReturns its content.';
  const report = toolReport(tool('local', description, { type: 'object' }));
  expect(reportText(report)).toContain('Read a note.\nReturns its content.');
  expect(reportText(report)).not.toContain('\\u000d');
  expect(report.facts.description).toBe('Read a note.\\u000aReturns its content.');
  expect(report.facts.size).toMatchObject({ descriptionBytes: Buffer.byteLength(description) });
});
