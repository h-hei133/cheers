import { expect, it } from 'vitest';
import { endpointBody, endpointShape, endpointTurnBody, endpointUrl } from '../index.js';
import { readCompletion } from '../../response/read.js';
import { toStep } from '../../../turn/step.js';
import type { StreamedCompletion } from '../../../turn/completion.js';
import { configuredOutputLimit } from '../../request/output.js';
import { DEFAULT_CONFIG, type RuntimeConfig } from '../../../config/runtimeConfig.js';

const kind = 'openai-account-responses';
const message = { type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', phase: 'final_answer',
  content: [{ type: 'output_text', text: 'answer' }] };
const reasoning = { type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'synthetic-cipher' };
const call = { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'write', arguments: '{"path":"a"}', status: 'completed' };
const usage = { input_tokens: 4, output_tokens: 2, total_tokens: 6 };
const sealed = (items: Record<string, unknown>[]) => items.flatMap((item, output_index) => [
  { type: 'response.output_item.added', output_index, item }, { type: 'response.output_item.done', output_index, item },
]);
const terminal = (type = 'response.done', status = 'completed', extra: Record<string, unknown> = {}) => ({ type,
  response: { id: 'r', status, usage, ...extra } });
function stream(events: unknown[], close = false) {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new TextEncoder().encode(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')));
    if (close) controller.close();
  }, cancel() { cancelled = true; } });
  return { body, cancelled: () => cancelled };
}
async function read(events: unknown[], endpoint = kind) {
  const wire = stream(events, endpoint !== kind), iterator = endpointShape(endpoint).readStream(wire.body);
  let next = await iterator.next(); while (!next.done) next = await iterator.next();
  if (endpoint === kind) expect(wire.cancelled()).toBe(true);
  expect(wire.body.locked).toBe(false);
  return next.value as StreamedCompletion;
}

it('declares native capabilities without public cap, models, tier or cache refresh contracts', () => {
  const shape = endpointShape(kind);
  expect(shape.simpleResponse).toBe('stream'); expect(shape.outputControl).toBe('provider'); expect(shape.opaqueReplay).toBe(true);
  expect(endpointUrl('https://chatgpt.com/backend-api', kind, 'm', false)).toBe('https://chatgpt.com/backend-api/codex/responses');
  expect(endpointBody(kind, { model: 'm', messages: [], temperature: 0.3 })).toMatchObject({ stream: true, store: false,
    instructions: 'You are a helpful assistant.', include: ['reasoning.encrypted_content'] });
  expect(endpointBody(kind, { model: 'm', messages: [], temperature: 0.3 })).not.toHaveProperty('temperature');
  for (const key of ['modelsPath', 'refreshBody', 'requestBound', 'serviceTiers']) expect(shape).not.toHaveProperty(key);
  expect(() => endpointBody(kind, { model: 'm', messages: [], maxOutputTokens: 1 })).toThrow(/explicit maxOutputTokens/);
  expect(() => endpointTurnBody(kind, { model: 'm', messages: [], tools: [], allowTools: false, serviceTier: 'flex' })).toThrow(/service tier/);
});

it('lets default output yield to the provider and rejects every explicit provenance', () => {
  const config = { maxOutputTokens: DEFAULT_CONFIG.maxOutputTokens,
    configProvenance: { maxOutputTokens: { sources: ['default'] } } } as RuntimeConfig;
  expect(configuredOutputLimit(config, kind)).toBeUndefined();
  expect(configuredOutputLimit(config, 'openai-responses')).toBe(DEFAULT_CONFIG.maxOutputTokens);
  for (const changed of [{ ...config, maxOutputTokens: 1 }, { maxOutputTokens: DEFAULT_CONFIG.maxOutputTokens },
    { ...config, configProvenance: { maxOutputTokens: { sources: ['user'] } } }]) {
    expect(() => configuredOutputLimit(changed as RuntimeConfig, kind)).toThrow(/explicit maxOutputTokens/);
  }
});

it.each(['response.done', 'response.completed'])('retains sealed native items without terminal output/model for %s', async type => {
  const completion = await read([...sealed([reasoning, message]), terminal(type)]);
  expect(completion.finishReason).toBe('stop'); expect(completion.message.content).toBe('answer');
  expect(completion.usage?.total_tokens).toBe(6);
  const step = toStep({ choices: [{ message: completion.message, finish_reason: completion.finishReason }],
    reasoning: completion.reasoning, reasoningSignature: completion.reasoningSignature }, {});
  const binding = 'a'.repeat(64);
  const body = endpointTurnBody(kind, { model: 'm', provider: 'openai', messages: [{ role: 'assistant', content: step.text,
    reasoning: step.reasoning, origin: { provider: 'openai', model: 'm', replayBinding: binding } }], replayBinding: binding,
    tools: [], allowTools: false });
  expect(body.input).toEqual([reasoning, message]);
  const foreign = endpointTurnBody(kind, { model: 'm', provider: 'openai', messages: [{ role: 'assistant', content: step.text,
    reasoning: step.reasoning, origin: { provider: 'openai', model: 'm', replayBinding: binding } }], replayBinding: 'b'.repeat(64), tools: [], allowTools: false });
  expect(JSON.stringify(foreign)).not.toContain('synthetic-cipher');
});

it('inherits created model and refuses a contradictory terminal model', async () => {
  const created = { type: 'response.created', response: { id: 'r', model: 'canonical-m' } };
  expect(JSON.parse((await read([created, ...sealed([message]), terminal()])).reasoningSignature!).model).toBe('canonical-m');
  expect((await read([created, ...sealed([message]), terminal('response.done', 'completed', { model: 'other' })])).finishReason).toBe('error');
});

it.each(['unsealed', 'sparse', 'foreign', 'failed', 'cancelled', 'mismatch', 'malformed'])('never admits native tools from %s completion', async fault => {
  const events = fault === 'unsealed' ? [{ type: 'response.output_item.added', output_index: 0, item: call }]
    : fault === 'sparse' ? sealed([call]).map(event => ({ ...event, output_index: 1 }))
      : sealed([{ ...call, ...(fault === 'malformed' ? { arguments: '{"path":' } : {}) }]);
  const last = terminal(fault === 'mismatch' ? 'response.completed' : 'response.done',
    fault === 'failed' || fault === 'cancelled' ? fault : fault === 'mismatch' ? 'incomplete' : 'completed',
    fault === 'foreign' ? { id: 'foreign' } : {});
  const result = await read([{ type: 'response.created', response: { id: 'r' } }, ...events, last]);
  expect(result.finishReason).toBe('error'); expect(result.message.tool_calls).toBeUndefined(); expect(result.reasoningSignature).toBeUndefined();
});

it.each(['max_output_tokens', 'content_filter'])('keeps native incomplete %s usage without tools', async reason => {
  const result = await read([...sealed([call]), terminal('response.done', 'incomplete', { incomplete_details: { reason } })]);
  expect(result.finishReason).toBe(reason === 'max_output_tokens' ? 'length' : 'content_filter');
  expect(result.usage?.total_tokens).toBe(6); expect(result.message.tool_calls).toBeUndefined(); expect(result.reasoningSignature).toBeUndefined();
});

it.each(['response.done', 'response.completed'])('keeps public reduced %s terminals strict', async type => {
  expect((await read([...sealed([message]), terminal(type)], 'openai-responses')).finishReason).toBe('error');
});

it('auxiliary requests consume terminal SSE and cancel a nonstream response', async () => {
  const wire = stream([...sealed([message]), terminal()]);
  const completion = await readCompletion(kind, new Response(wire.body, { headers: { 'content-type': 'text/event-stream' } }));
  expect(completion.choices?.[0]?.message?.content).toBe('answer'); expect(wire.cancelled()).toBe(true);
  const json = stream([]);
  await expect(readCompletion(kind, new Response(json.body, { headers: { 'content-type': 'application/json' } }))).rejects.toThrow(/event stream/);
  expect(json.cancelled()).toBe(true); expect(json.body.locked).toBe(false);
});
