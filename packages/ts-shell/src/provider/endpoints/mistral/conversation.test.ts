import { expect, it } from 'vitest';
import { resetSessionUsage } from '../../../observability/usageTelemetry.js';
import { FINAL_STEP_MESSAGE } from '../../../turn/messages.js';
import { toChatMessages } from '../../../turn/prompt.js';
import { createStepFunction } from '../../../turn/step.js';
import { requestSimpleCompletion } from '../../request/completion.js';
import { endpointShape, endpointUrl } from '../index.js';

const endpoint = 'mistral-conversations-native';
const shape = endpointShape(endpoint);
const target = { provider: 'openai-compatible', model: 'native-fixture', endpoint,
  baseUrl: 'https://fixture.invalid/v1', headers: {} };
const usage = { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 };
const start = { type: 'conversation.response.started', conversation_id: 'fixture-id' };
const done = { type: 'conversation.response.done', usage };
const reasoning = { type: 'thinking', signature: 'fixture-signature', thinking: [{ type: 'text', text: 'Think.' }] };
const first = { type: 'message.output.delta', id: 'answer', output_index: 0, content_index: 0, content: reasoning };
const text = { ...first, content_index: 1, content: { type: 'text', text: 'Look.' } };
const tool = { type: 'function.call.delta', id: 'function', output_index: 1, tool_call_id: 'tool-id', name: 'read' };
const firstArgs = { ...tool, arguments: '{"path":' };
const lastArgs = { ...tool, arguments: '"fixture.txt"}' };

function streaming(...events: readonly Record<string, unknown>[]): Response {
  const body = events.map(event => `event: ${event.type}\r\ndata: ${JSON.stringify(event)}\r\n\r\n`).join('');
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

it('uses native conversation frames across a real turn and a simple completion', async () => {
  const sessionId = 'native-conversation-fixture';
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    if (requests.length === 1) return streaming(start, first, text, firstArgs, lastArgs, done);
    if (requests.length === 2) return streaming(start, { ...text, output_index: 0, content_index: 0, content: 'Done.' }, done);
    return Response.json({ object: 'conversation.response', conversation_id: 'simple-id', usage,
      outputs: [{ type: 'message.output', content: [{ type: 'text', text: 'Summary.' }] }] });
  };
  const read = { type: 'function' as const, function: { name: 'read', description: 'Read a file', parameters: { type: 'object' } } };
  const step = createStepFunction({ provider: target, workspaceRoot: process.cwd(), sessionId,
    tools: [read], systemPrompt: 'Brief answers.', maxOutputTokens: 500, fetchImpl });
  const input = { role: 'user' as const, content: 'Check a file.' };
  const seen: string[] = [];
  try {
    const result = await step([input], undefined, { onReasoning: delta => seen.push(delta), onText: delta => seen.push(delta) }, { allowTools: true });
    expect(seen).toEqual(['Think.', 'Look.']);
    expect(result).toMatchObject({ text: 'Look.', reasoning: { text: 'Think.', signature: expect.any(String) },
      toolCalls: [{ id: 'tool-id', name: 'read', args: { path: 'fixture.txt' } }] });
    const history = toChatMessages([input, { role: 'assistant', content: result.text, reasoning: result.reasoning,
      origin: result.origin, tool_calls: result.toolCalls.map(call => ({ id: call.id, type: 'function',
        function: { name: call.name, arguments: JSON.stringify(call.args) } })) },
    { role: 'tool', tool_call_id: 'tool-id', content: 'The file content.' }]);
    expect(await step(history, undefined, {}, { allowTools: false })).toMatchObject({ text: 'Done.', toolCalls: [] });
    expect(await requestSimpleCompletion({ provider: { ...target, providerId: target.provider, fetchImpl },
      messages: [{ role: 'system', content: 'Summarize.' }, ...history] })).toBe('Summary.');
    expect(requests.map(({ url }) => url)).toEqual(Array(3).fill('https://fixture.invalid/v1/conversations'));
    expect(requests[0]?.body).toMatchObject({ model: target.model, instructions: 'Brief answers.', store: false,
      stream: true, handoff_execution: 'client', tools: [read], completion_args: { max_tokens: 500, tool_choice: 'auto' },
      inputs: [{ type: 'message.input', role: 'user', content: 'Check a file.' }] });
    const replayed = [{ type: 'message.input', role: 'user', content: 'Check a file.' },
      { type: 'message.output', content: [reasoning, { type: 'text', text: 'Look.' }] },
      { type: 'function.call', tool_call_id: 'tool-id', name: 'read', arguments: '{"path":"fixture.txt"}' },
      { type: 'function.result', tool_call_id: 'tool-id', result: 'The file content.' }];
    expect(requests[1]?.body).toMatchObject({ store: false, stream: true, completion_args: { tool_choice: 'none' },
      inputs: [...replayed, { type: 'message.input', role: 'user', content: FINAL_STEP_MESSAGE }] });
    expect(requests[2]?.body).toMatchObject({ store: false, stream: false, inputs: replayed, instructions: 'Summarize.' });
    for (const { body } of requests.slice(1)) {
      expect(body.tools).toBeUndefined();
      expect(JSON.stringify(body)).not.toMatch(/fixture-id|replayBinding|conversation_id/);
    }
    expect(endpointShape('mistral-conversations')).toBe(endpointShape('mistral-chat-completions'));
    expect(endpointUrl(target.baseUrl, 'mistral-conversations', target.model)).toBe('https://fixture.invalid/v1/chat/completions');
  } finally { resetSessionUsage(sessionId); }
});

it.each([
  { case: 'missing terminal', events: [start, firstArgs, lastArgs], error: /ended before/ },
  { case: 'empty terminal', events: [start, done], error: /invalid or unsupported/i },
  { case: 'incomplete function arguments', events: [start, firstArgs, done], error: /invalid or unsupported/i },
  { case: 'mixed identity', events: [start, firstArgs, { ...lastArgs, tool_call_id: 'other' }, done], error: /invalid or unsupported/i },
  { case: 'remote tool', events: [start, { type: 'tool.execution.started', id: 'remote' }, done], error: /invalid or unsupported/i },
  { case: 'handoff', events: [start, { type: 'agent.handoff.started', id: 'remote' }, done], error: /invalid or unsupported/i },
  { case: 'stream refusal', events: [start, { type: 'conversation.response.error', message: 'opaque provider text' }], error: /Response details withheld/ },
])('refuses $case before publishing an executable tool call', async ({ events, error }) => {
  const reader = shape.readStream(streaming(...events).body!);
  await expect(reader.next()).rejects.toThrow(error);
});

it('validates and normalizes complete JSON function calls through the same result shape', () => {
  expect(shape.readBody({ conversation_id: 'fixture-id', usage, outputs: [
    { type: 'message.output', content: [reasoning, { type: 'text', text: 'Look.' }] },
    { type: 'function.call', tool_call_id: 'tool-id', name: 'read', arguments: { path: 'fixture.txt' } },
  ] })).toMatchObject({ usage, reasoning: 'Think.', reasoningSignature: expect.any(String), choices: [{
    finish_reason: 'tool_calls', message: { content: 'Look.', tool_calls: [{ id: 'tool-id', type: 'function',
      function: { name: 'read', arguments: '{"path":"fixture.txt"}' } }] },
  }] });
  expect(() => shape.readBody({ conversation_id: 'fixture-id', usage, outputs: [{ type: 'tool.execution' }] }))
    .toThrow(/invalid or unsupported/i);
});

it('accepts documented guardrail metadata alongside the answer without returning it', () => {
  const result = shape.readBody({ conversation_id: 'fixture-id', usage,
    outputs: [{ type: 'message.output', content: 'Answer.' }],
    guardrails: [{ category: 'private fixture detail' }],
  });
  expect(result).toMatchObject({ choices: [{ message: { content: 'Answer.' } }], usage });
  expect(JSON.stringify(result)).not.toContain('private fixture detail');
});

it.each([
  { code: 401, failureClass: 'provider_auth' },
  { code: 429, failureClass: 'provider_rate_limited' },
])('retains the in-band $code failure class without publishing a queued tool call', async ({ code, failureClass }) => {
  const reader = shape.readStream(streaming(start, firstArgs, lastArgs, {
    type: 'conversation.response.error', code, message: 'private fixture detail',
  }).body!);
  await expect(reader.next()).rejects.toMatchObject({ failureClass,
    message: `Provider reported an error: ${failureClass}. Response details withheld.` });
});
