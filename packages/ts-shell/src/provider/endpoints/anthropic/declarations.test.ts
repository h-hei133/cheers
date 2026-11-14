import { expect, it } from 'vitest';
import type { RequestDeclaration } from '../../../core/agent/declarations/model.js';
import type { ChatMessage } from '../../../turn/prompt.js';
import { anthropicBetaHeaders, anthropicRequestBody, type AnthropicRequestInput } from '../anthropicMessages.js';
import { declareToolChanges } from '../anthropicCachePreservation.js';

type DeclaredMessage = ChatMessage & { readonly id?: string; readonly requestDeclaration?: RequestDeclaration };
type DeclaredInput = AnthropicRequestInput & { readonly declarationTarget: RequestDeclaration['target'] };
type WireMessage = { role: string; content: Array<Record<string, unknown>>; output_config?: { effort: string } };

const target: RequestDeclaration['target'] = {
  provider: 'anthropic', model: 'claude-opus-4-6', endpoint: 'anthropic-messages', replayBinding: 'a'.repeat(64),
};
const tool = (name: string, property = 'path'): RequestDeclaration['tools'][number] => ({
  type: 'function', function: { name, description: `${name} tool`,
    parameters: { type: 'object', properties: { [property]: { type: 'string' } } } },
});
const definition = (entry: RequestDeclaration['tools'][number]) => ({
  name: entry.function.name, description: entry.function.description, input_schema: entry.function.parameters,
});
const addition = (entry: RequestDeclaration['tools'][number]) => ({
  type: 'tool_addition', tool: { type: 'tool_definition', definition: definition(entry) },
});
const removal = (name: string) => ({ type: 'tool_removal', tool: { type: 'tool_reference', name } });
const marker = (id: string, tools: RequestDeclaration['tools'], effort?: string,
  markerTarget = target): DeclaredMessage => ({
  id, role: 'system', content: '', requestDeclaration: {
    version: 1, target: markerTarget, tools, ...(effort === undefined ? {} : { effort }),
  },
});
const user = (content: string): DeclaredMessage => ({ role: 'user', content });
const assistant = (content: string): DeclaredMessage => ({ role: 'assistant', content });
const input = (messages: readonly DeclaredMessage[], tools: RequestDeclaration['tools'],
  extra: Partial<DeclaredInput> = {}): DeclaredInput => ({
  model: target.model, systemPrompt: '', messages, tools, allowTools: true, cacheRetention: 'none',
  supportsMidConvoToolChanges: true, declarationTarget: target, ...extra,
});
const messages = (body: Record<string, unknown>): WireMessage[] => body.messages as WireMessage[];
const controls = (body: Record<string, unknown>) => messages(body).filter(message => message.role === 'system');

it('keeps the first epoch snapshot as baseline and projects adjacent changes at their original markers', () => {
  const read = tool('read'); const changedRead = tool('read', 'filename'); const write = tool('write');
  const firstHistory = [marker('baseline', [read]), user('first'), assistant('first answer')];
  const history = [...firstHistory,
    marker('modified', [changedRead, write]), user('second'), assistant('second answer'),
    marker('same', [changedRead, write]), user('same'), assistant('same answer'),
    marker('removed', []), user('third'), assistant('third answer'),
    marker('restored', [read]), user('fourth'),
  ];
  const body = anthropicRequestBody(input(history, [read], { initialTools: [tool('stale')] }));
  expect(body.tools).toEqual([definition(read), { type: 'tool_search_tool_bm25_20250305', name: 'tool_search' }]);
  expect(controls(body)).toEqual([
    { role: 'system', content: [removal('read'), addition(changedRead), addition(write)] },
    { role: 'system', content: [removal('read'), removal('write')] },
    { role: 'system', content: [addition(read)] },
  ]);
  const wire = messages(body);
  expect(wire.findIndex(message => message.content.some(block => block.type === 'tool_addition')))
    .toBeLessThan(wire.findIndex(message => message.content.some(block => block.text === 'second answer')));
  expect(wire.at(-1)).toEqual({ role: 'system', content: [addition(read)] });
  expect(wire.slice(0, 2)).toEqual(messages(anthropicRequestBody(input(firstHistory, [read]))));
});

it('combines each marker control and waits past tool results and empty assistants for a real assistant', () => {
  const read = tool('read'); const write = tool('write');
  const history: DeclaredMessage[] = [marker('baseline', [read], 'low'), user('read both'),
    { role: 'assistant', content: '', tool_calls: [
      { id: 'read-1', type: 'function', function: { name: 'read', arguments: '{}' } },
      { id: 'read-2', type: 'function', function: { name: 'read', arguments: '{}' } },
    ] },
    marker('changed', [read, write], 'high'),
    { role: 'tool', content: 'one', tool_call_id: 'read-1' }, assistant(''),
    { role: 'tool', content: 'two', tool_call_id: 'read-2' }, user('continue'), assistant('done'),
  ];
  const body = anthropicRequestBody(input(history, [read, write], { supportsMidConvoEffort: true, thinkingLevelName: 'high' }));
  expect(controls(body)).toEqual([
    { role: 'system', content: [], output_config: { effort: 'low' } },
    { role: 'system', content: [addition(write)], output_config: { effort: 'high' } },
  ]);
  const wire = messages(body);
  const callIndex = wire.findIndex(message => message.content.some(block => block.type === 'tool_use'));
  expect(wire[callIndex + 1]).toMatchObject({ role: 'user', content: [
    { type: 'tool_result', tool_use_id: 'read-1' }, { type: 'tool_result', tool_use_id: 'read-2' },
  ] });
  expect(wire.at(-2)).toEqual({ role: 'system', content: [addition(write)], output_config: { effort: 'high' } });
  expect(wire.at(-1)?.content).toEqual([{ type: 'text', text: 'done' }]);
});

it('uses only the final A epoch after A to B to A instead of borrowing the old A baseline', () => {
  const read = tool('read'); const write = tool('write'); const web = tool('web');
  const otherTarget = { ...target, replayBinding: 'b'.repeat(64) };
  const history = [marker('a-old', [read]), user('old A'), assistant('old A answer'),
    marker('b', [web], undefined, otherTarget), user('B'), assistant('B answer'),
    marker('a-new', [write]), user('new A'), assistant('new A answer')];
  const body = anthropicRequestBody(input(history, [write], { initialTools: [read] }));
  expect(body.tools).toEqual([definition(write), { type: 'tool_search_tool_bm25_20250305', name: 'tool_search' }]);
  expect(controls(body)).toEqual([]);
  expect(messages(body).map(message => message.content[0]?.text)).toEqual([
    'old A', 'old A answer', 'B', 'B answer', 'new A', 'new A answer',
  ]);
});

it('suppresses tool declarations only for the closing request while retaining effort and durable markers', () => {
  const read = tool('read'); const write = tool('write');
  const history = [marker('baseline', [read], 'low'), user('first'), assistant('first answer'),
    marker('changed', [read, write], 'high'), user('finish')];
  const before = JSON.stringify(history);
  const options = { supportsMidConvoEffort: true, thinkingLevelName: 'high' };
  const closed = anthropicRequestBody(input(history, [], { ...options, allowTools: false }));
  expect(closed.tools).toBeUndefined();
  expect(controls(closed)).toEqual([
    { role: 'system', content: [], output_config: { effort: 'low' } },
    { role: 'system', content: [], output_config: { effort: 'high' } },
  ]);
  expect(JSON.stringify(history)).toBe(before);
  const reopened = anthropicRequestBody(input(history, [read, write], options));
  expect(controls(reopened).at(-1)).toEqual({ role: 'system', content: [addition(write)], output_config: { effort: 'high' } });
  expect(JSON.stringify(history)).toBe(before);
});

it('omits top-level tools for an empty baseline while preserving the original inline addition', () => {
  const write = tool('write');
  const history = [marker('empty', []), user('first'), assistant('first answer'),
    marker('addition', [write]), user('second'), assistant('second answer')];
  const body = anthropicRequestBody(input(history, [write], { initialTools: [] }));
  expect(body.tools).toBeUndefined();
  expect(controls(body)).toEqual([{ role: 'system', content: [addition(write)] }]);
  expect(messages(body).at(-2)).toEqual({ role: 'system', content: [addition(write)] });
  expect(declareToolChanges([], []).topLevelTools).toEqual([]);
  expect(declareToolChanges([], [write]).topLevelTools).toEqual([]);
});

it('keeps provider-default thinking for active auto without replaying prior high or inventing a reset', () => {
  const read = tool('read'); const write = tool('write');
  const history = [marker('high', [read], 'high'), user('first'), assistant('first answer'),
    marker('auto', [read, write]), user('second')];
  const before = JSON.stringify(history);
  const body = anthropicRequestBody(input(history, [read, write], { initialTools: [read], supportsMidConvoEffort: true }));
  expect(body.thinking).toBeUndefined(); expect(body.output_config).toBeUndefined();
  expect(controls(body)).toEqual([{ role: 'system', content: [addition(write)] }]);
  expect(JSON.stringify(body)).not.toContain('"effort"');
  expect(JSON.stringify(history)).toBe(before);
});

it('falls back to current top-level thinking for high to auto to low rather than carrying high across auto', () => {
  const read = tool('read');
  const history = [marker('high', [read], 'high'), user('first'), assistant('first answer'),
    marker('auto', [read]), user('second'), assistant('second answer'),
    marker('low', [read], 'low'), user('third')];
  const body = anthropicRequestBody(input(history, [read], {
    initialTools: [read], supportsMidConvoEffort: true, thinkingLevelName: 'low', thinkingBudgetTokens: 2048, maxOutputTokens: 4096,
  }));
  expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 2048 });
  expect(body.output_config).toBeUndefined();
  expect(controls(body)).toEqual([]);
  expect(JSON.stringify(body)).not.toContain('"effort"');
});

it('retains native-history beta headers after the current snapshot removes every tool', () => {
  const read = tool('read');
  const history = [marker('baseline', [read], 'high'), user('first'), assistant('first answer'),
    marker('removed', [], 'low'), user('second')];
  const request = input(history, [], { initialTools: [], supportsMidConvoEffort: true, thinkingLevelName: 'low' });
  expect(anthropicBetaHeaders(request)['anthropic-beta']).toBe(
    'mid-conversation-output-config-2026-07-01,thinking-binding-controls-2026-08-01,inline-tools-2026-09-15',
  );
  const body = anthropicRequestBody(request);
  expect(body.tools).toEqual([definition(read), { type: 'tool_search_tool_bm25_20250305', name: 'tool_search' }]);
  expect(controls(body)).toEqual([
    { role: 'system', content: [], output_config: { effort: 'high' } },
    { role: 'system', content: [removal('read')], output_config: { effort: 'low' } },
  ]);
});
