import { expect, it, vi } from 'vitest';
import { toChatMessages } from './prompt.js';
import { outgoingProjection, providerSystemPrompt } from './messages.js';
import { historyDigest } from '../context/request/identity.js';
import { estimateTokens } from '../session/context.js';
import type { AgentMessage } from '../core/agent/state.js';
import { endpointTurnBody } from '../provider/endpoints/index.js';
import { createTurnContextPreparer } from './context/prepare.js';
import type { ToolSchema } from './tools.js';
import { createStepFunction } from './step.js';

const marker: AgentMessage = { id: 'loadout', role: 'system', content: '', requestDeclaration: {
  version: 1, target: { provider: 'fixture', model: 'm', endpoint: 'anthropic-messages', replayBinding: 'a'.repeat(64) },
  tools: [{ type: 'function', function: { name: 'read', parameters: { description: '界'.repeat(4096) } } }], effort: 'low',
} };

it('carries declaration markers through ordinary outgoing projection without closing tool pairs', () => {
  const history: AgentMessage[] = [
    { role: 'assistant', content: '', tool_calls: [{ id: 'call', type: 'function', function: { name: 'read', arguments: '{}' } }] },
    marker, { role: 'tool', content: 'result', tool_call_id: 'call' }, { role: 'user', content: 'continue' },
  ];
  const projected = toChatMessages(history);
  expect(projected.map(message => message.role)).toEqual(['assistant', 'system', 'tool', 'user']);
  expect(projected[1]).toMatchObject(marker);
  expect(projected[2]?.content).toBe('result');
  expect(outgoingProjection(history, false, { pruneToolText: true }).messages[1]).toMatchObject(marker);
  expect(providerSystemPrompt('base', [{ role: 'system', content: 'extra' }, projected[1]!])).toBe('base\n\nextra');
});

it('includes the full declaration in raw history identity and local fallback token accounting', () => {
  const changed = { ...marker, requestDeclaration: { ...marker.requestDeclaration!, effort: 'high' } };
  expect(historyDigest([marker])).not.toBe(historyDigest([changed]));
  expect(estimateTokens([marker])).toBeGreaterThan(1000);
  expect(estimateTokens([{ role: 'system', content: '' }])).toBe(0);
});

it('omits declaration carriers on protocols without native history controls', () => {
  for (const endpoint of ['openai-compatible', 'openai-responses', 'google-generative-ai'] as const) {
    const request = { provider: 'fixture', model: 'm', replayBinding: 'a'.repeat(64),
      systemPrompt: '', messages: toChatMessages([marker, { role: 'user', content: 'continue' }]),
      tools: [], allowTools: false, vision: false, temperature: 0.7 };
    const body = endpointTurnBody(endpoint, request);
    expect(body).toEqual(endpointTurnBody(endpoint, { ...request, messages: toChatMessages([{ role: 'user', content: 'continue' }]) }));
    expect(JSON.stringify(body)).not.toContain('requestDeclaration');
    expect(JSON.stringify(body)).not.toContain('loadout');
  }
});

it.each(['', [], [{ type: 'text', text: '' }]] as const)('keeps real parallel tool results across declaration markers and a silent assistant in the actual outgoing path: %j', content => {
  const calls = ['one', 'two'].map(id => ({ id, type: 'function' as const, function: { name: 'read', arguments: '{}' } }));
  const history: AgentMessage[] = [{ role: 'assistant', content: '', tool_calls: calls }, marker,
    { role: 'tool', content: 'first result', tool_call_id: 'one' }, { role: 'assistant', content },
    { role: 'tool', content: 'second result', tool_call_id: 'two' }, { role: 'assistant', content: 'done' }];
  const wire = outgoingProjection(history, false).messages;
  expect(wire.filter(message => message.role === 'tool').map(message => message.content)).toEqual(['first result', 'second result']);
  const body = endpointTurnBody('anthropic-messages', { provider: 'fixture', model: 'm', systemPrompt: '',
    messages: wire, tools: [], allowTools: false, vision: false, temperature: 0.7, declarationTarget: marker.requestDeclaration!.target });
  expect((body.messages as Array<{ content: Array<{ type: string; content?: string }> }>)[1]?.content).toEqual([
    { type: 'tool_result', tool_use_id: 'one', content: 'first result' },
    { type: 'tool_result', tool_use_id: 'two', content: 'second result' },
  ]);
});

it.each(['getter', 'version', 'oversize'] as const)('refuses malformed reused provider declarations before step dispatch: %s', async defect => {
  const hook = vi.fn(() => marker.requestDeclaration);
  const sends = vi.fn(async () => new Response('{}'));
  const malformed = defect === 'getter' ? Object.defineProperty({ ...marker }, 'requestDeclaration', { enumerable: true, get: hook })
    : { ...marker, requestDeclaration: { ...marker.requestDeclaration!, ...(defect === 'version' ? { version: 2 }
      : { tools: [{ type: 'function', function: { name: 'read', parameters: { text: '界'.repeat(1_500_000) } } }] }) } };
  const step = createStepFunction({ provider: { headers: {}, baseUrl: 'https://fixture.invalid', model: 'm' },
    systemPrompt: '', tools: [], workspaceRoot: process.cwd(), sessionId: 'reuse-declaration', fetchImpl: sends });
  const result = await step([], undefined, {}, { allowTools: false, sourceMessages: [defect === 'getter' ? marker : malformed as unknown as AgentMessage],
    providerMessages: [malformed as unknown as AgentMessage] });
  expect(result.stopReason).toBe('error');
  expect(hook).not.toHaveBeenCalled(); expect(sends).not.toHaveBeenCalled();
});

it.each(['raw', 'reuse'] as const)('refuses explicit undefined in a declaration schema before %s normalization', async path => {
  const malformed: AgentMessage = { ...marker, requestDeclaration: { ...marker.requestDeclaration!, tools: [
    { type: 'function', function: { name: 'read', parameters: { type: 'object', invalid: undefined } } },
  ] } } as unknown as AgentMessage;
  const prepare = createTurnContextPreparer({ provider: { headers: {}, baseUrl: 'https://fixture.invalid', model: 'm' },
    systemPrompt: '', tools: [], workspaceRoot: process.cwd(), sessionId: 'malformed-declaration' }, { allowTools: false },
  { effortAccepted: () => true, streamAttempts: () => 0, replayBinding: 'a'.repeat(64), explicitEffort: false });
  await expect(path === 'raw' ? prepare([malformed])
    : prepare([marker], undefined, { messages: [malformed], providerMessages: [malformed] })).rejects.toThrow();
});

it('prices the actual historical native wire and forwards the routed target through endpointTurnBody', async () => {
  const first: AgentMessage = { ...marker, requestDeclaration: { ...marker.requestDeclaration!, tools: [] } };
  const history: AgentMessage[] = [first, { role: 'user', content: 'first' }, { role: 'assistant', content: 'answer' },
    { ...marker, id: 'second' }, { role: 'user', content: 'continue' }];
  const prepare = createTurnContextPreparer({
    provider: { provider: 'fixture', model: 'm', endpoint: 'anthropic-messages', baseUrl: 'https://fixture.invalid', headers: {}, replayBinding: 'a'.repeat(64) },
    tools: marker.requestDeclaration!.tools as readonly ToolSchema[], systemPrompt: '', workspaceRoot: process.cwd(), sessionId: 'declaration-budget',
    initialTools: marker.requestDeclaration!.tools as readonly ToolSchema[], maxOutputTokens: 100, reserveTokens: 0, contextWindow: 500,
    catalog: [{ id: 'fixture', models: [{ id: 'm', toolCalling: true, compat: { supportsMidConvoToolChanges: true } }] }],
  }, { allowTools: true }, { effortAccepted: () => true, streamAttempts: () => 0, replayBinding: 'a'.repeat(64), explicitEffort: false });
  const prepared = await prepare(history);
  expect(prepared.payload.tools).toBeUndefined();
  expect(JSON.stringify(prepared.payload.messages)).toContain('tool_addition');
  expect(prepared.prompt.tokens).toBeGreaterThan(1000);
  expect(prepared.refusal?.detail).toContain('Context overflow');
});
