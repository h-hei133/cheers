import { expect, it } from 'vitest';
import { contextReport } from './report.js';
import { reportText } from '../report/projection.js';
import { requestContext } from '../../../context/request/projection.js';

const input = { resolution: { window: 200000, source: 'catalog' as const }, reserve: 17000,
  schemaTokens: 8000, toolCount: 22, totalTokens: 72000, turns: 2 };

it('keeps exact wire dimensions, raw estimates, tokenizer absence and provider usage distinct', () => {
  const request = requestContext({ body: JSON.stringify({ messages: [{ role: 'system', content: 'PRIVATE_INSTRUCTIONS🔒' }], secret: 'FIXTURE_SECRET' }),
    provider: 'fixture', model: 'm', endpoint: 'openai-compatible', fields: { conversation: 'messages', firstMessageIsSystem: true },
    systemSources: [{ kind: 'instructions', bytes: 24, codeUnits: 21 }],
  });
  const report = contextReport({ ...input, used: undefined, schemaSize: { bytes: 120, codeUnits: 100 }, request: { ...request, promptTokens: 0 } });
  expect(report.facts.request).toMatchObject({ status: 'accepted', body: request.body, tokenizer: { status: 'unavailable' }, usage: { status: 'reported', promptTokens: 0 } });
  expect(report.facts.toolSchemas).toMatchObject({ characterUnit: 'utf16-code-units', divisor: 3.5, size: { bytes: 120, codeUnits: 100 } });
  expect(reportText(report)).toContain('raw source sizes are not additive to wire sizes');
  expect(reportText(report)).toContain('Provider reported 0 input tokens');
  expect(reportText(report)).toContain('Last accepted foreground request');
  expect(reportText(report)).toContain('context gauge can include delegated requests');
  expect(JSON.stringify(report)).not.toMatch(/PRIVATE_INSTRUCTIONS|FIXTURE_SECRET/);
  expect(contextReport({ ...input, used: undefined, request }).facts.request).toMatchObject({ usage: { status: 'unknown' } });
});

it('retains independent measured, estimated and unknown context facts', () => {
  const report = contextReport({ ...input, used: 64000 });
  expect(report.facts).toMatchObject({ prompt: { status: 'reported', tokens: 64000 }, freeTokens: 119000,
    toolSchemas: { status: 'estimate', method: 'characters', tokens: 8000, toolCount: 22 } });
  expect(reportText(report)).toContain('32.0% used');
  expect(report.lines.flatMap(line => line.kind === 'text' ? line.spans : [])).toEqual(expect.arrayContaining([
    { text: '█'.repeat(10), role: 'emphasis' }, { text: '▒'.repeat(3), role: 'subtle' }, { text: '░'.repeat(19), role: 'muted' },
  ]));
  expect(reportText(report)).toContain('119,000 free before the 17,000-token reserve');
  const unknown = contextReport({ ...input, used: undefined });
  expect(unknown.facts.prompt).toEqual({ status: 'unknown' });
  expect(unknown.facts.session).toEqual({ recordedTokens: 72000, recordedTurns: 2 });
  expect(contextReport({ ...input, used: 0 }).facts.prompt).toEqual({ status: 'reported', tokens: 0 });
});

it.each([[49, 'normal'], [50, 'elevated'], [70, 'high'], [90, 'critical']] as const)(
  'assigns shared risk roles to %s percent without changing the number', (percent, role) => {
    const report = contextReport({ ...input, used: percent * 2000 });
    expect(report.lines.flatMap(line => line.kind === 'text' ? line.spans : [])).toContainEqual({ text: `${percent}.0%`, role: `context-${role}` });
  });
