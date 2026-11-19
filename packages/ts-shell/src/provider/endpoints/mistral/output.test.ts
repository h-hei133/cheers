import { expect, it } from 'vitest';
import { resetSessionUsage } from '../../../observability/usageTelemetry.js';
import { createMessageTranscriptEvent, decodeTranscriptLine, transcriptEventToSessionMessage } from '../../../session/sessionEventCodec.js';
import { toChatMessages, type ChatMessage } from '../../../turn/prompt.js';
import { createStepFunction, toStep } from '../../../turn/step.js';
import { requestSimpleCompletion } from '../../request/completion.js';
import { requestReplayBinding } from '../../request/replay.js';
import { endpointBody, endpointShape, endpointTurnBody, type TurnRequest } from '../index.js';

const endpoint = 'mistral-chat-completions';
const shape = endpointShape(endpoint);
const content = [
  { type: 'text', text: 'Before ' },
  { type: 'thinking', thinking: [{ type: 'text', text: 'First ' }, { type: 'text', text: 'thought. ' }], signature: 'signed-one', closed: true },
  { type: 'text', text: 'and after.' },
  { type: 'thinking', thinking: [{ type: 'text', text: 'Second thought.' }], signature: 'signed-two' },
];
const call = { id: 'Run123456', type: 'function' as const, function: { name: 'read', arguments: '{ "path": "file.txt" }' } };
const wire = { choices: [{ message: { role: 'assistant', content, tool_calls: [call], reasoning_text: 'Mirrored reasoning' }, finish_reason: 'tool_calls' }],
  usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 } };
const target = { provider: 'mistral-fixture', model: 'native', baseUrl: 'https://mistral-fixture.invalid/v1', endpoint, headers: {} };
const binding = requestReplayBinding(target);

it('replays ordered signed JSON through the actual turn, transcript and simple completion routes', async () => {
  const sessionId = 'mistral-signed-json-fixture';
  const requests: { url: string; body: { messages: Record<string, unknown>[] } }[] = [];
  const shown: string[] = [];
  const user = { role: 'user' as const, content: 'Inspect this file.' };
  const step = createStepFunction({ provider: target, workspaceRoot: process.cwd(), sessionId, systemPrompt: 'brief',
    tools: [{ type: 'function', function: { name: 'read', description: 'Read a file', parameters: { type: 'object' } } }],
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return Response.json(requests.length === 1 ? wire : { choices: [{ message: { content: 'Done.' }, finish_reason: 'stop' }] });
    } });
  try {
    const first = await step([user], undefined, { onReasoning: text => shown.push(text), onText: text => shown.push(text) }, { allowTools: true });
    expect(first).toMatchObject({ text: 'Before and after.', stopReason: 'stop',
      reasoning: { text: 'First thought. Second thought.', signature: expect.any(String) },
      origin: { provider: target.provider, model: target.model, replayBinding: binding },
      toolCalls: [{ id: call.id, name: 'read', args: { path: 'file.txt' } }] });
    expect(shown).toEqual(['First thought. Second thought.', 'Before and after.']);
    const stored = transcriptEventToSessionMessage(decodeTranscriptLine(JSON.stringify(createMessageTranscriptEvent({
      role: 'assistant', content: first.text, reasoning: first.reasoning, origin: first.origin,
      tool_calls: first.toolCalls.map(value => ({ id: value.id, type: 'function',
        function: { name: value.name, arguments: JSON.stringify(value.args) } })), timestamp: '2026-11-20T00:00:00Z',
    }))));
    expect(stored?.reasoning).toEqual(first.reasoning);
    const history = toChatMessages([user, stored!, { role: 'tool', tool_call_id: call.id, content: 'Found.' }]);
    expect((await step(history, undefined, {}, { allowTools: true })).text).toBe('Done.');
    expect(requests.map(request => request.url)).toEqual(Array(2).fill(target.baseUrl + '/chat/completions'));
    const assistant = { role: 'assistant', content, tool_calls: [{ ...call, function: { ...call.function, arguments: '{"path":"file.txt"}' } }] };
    expect(requests[1]?.body.messages.find(message => message.role === 'assistant')).toEqual(assistant);
    expect(requests[1]?.body.messages.find(message => message.role === 'tool')).toEqual({ role: 'tool', tool_call_id: call.id, content: 'Found.' });
    expect(JSON.stringify(requests[1]?.body)).not.toContain('replayBinding');
    let simpleAssistant: unknown;
    const answer = await requestSimpleCompletion({ provider: { ...target, providerId: target.provider, fetchImpl: async (_url, init) => {
      simpleAssistant = JSON.parse(String(init?.body)).messages.find((message: Record<string, unknown>) => message.role === 'assistant');
      return Response.json({ choices: [{ message: { content: [
        { type: 'thinking', thinking: [{ type: 'text', text: 'Private to the reasoning channel' }] },
        { type: 'text', text: 'The ' }, { type: 'text', text: 'answer.' },
      ] }, finish_reason: 'stop' }] });
    } }, messages: history });
    expect(answer).toBe('The answer.');
    expect(simpleAssistant).toEqual(assistant);
  } finally { resetSessionUsage(sessionId); }
});

it('leaves unsigned structured reasoning visible and retains the primary choice and metering', () => {
  const unsigned = [{ type: 'text', text: 'A ' }, { type: 'thinking', thinking: [{ type: 'text', text: 'Think.' }] },
    'B', { type: 'reference', reference_ids: [1] }, { type: 'text', text: ' C' }];
  const body = { choices: [{ message: { content: unsigned, reasoning_content: 'Duplicate' }, finish_reason: 'stop' },
    { message: { content: [{ type: 'text', text: 'Second choice' }] } }], usage: wire.usage };
  const decoded = shape.readBody(body);
  expect(decoded.choices?.map(choice => choice.message?.content)).toEqual(['A B C', 'Second choice']);
  expect(decoded.reasoning).toBe('Think.');
  expect(decoded.reasoningSignature).toBeUndefined();
  expect(decoded.usage).toEqual(wire.usage);
  expect(endpointShape('mistral-conversations').readBody(body)).toEqual(decoded);
  expect(endpointShape('openai-compatible').readBody(body).choices?.[0]?.message?.content).toEqual(unsigned);
  expect(shape.readBody({ choices: [{ message: { content: 'String', reasoning_text: 'Alias' } }] })).toMatchObject({ reasoning: 'Alias' });
});

it.each(['length', 'model_length', 'refusal', 'absent', 'malformed arguments', 'unsupported block', 'open thinking', 'prefixed', 'other role', 'unbounded'] as const)(
  'withholds replay for %s while keeping admitted text', condition => {
    const parts = condition === 'unsupported block' ? [...content, { type: 'reference' }]
      : condition === 'open thinking' ? [content[0], { ...content[1], closed: false }] : condition === 'unbounded' ? [...content,
        { type: 'text', text: 'a'.repeat(1024 * 1024) }] : content;
    const first = wire.choices[0]!;
    const decoded = shape.readBody({ ...wire, choices: [{ finish_reason: condition === 'absent' ? undefined
      : condition === 'length' || condition === 'model_length' ? condition : first.finish_reason,
    message: { ...first.message, content: parts, ...(condition === 'refusal' ? { refusal: 'Withheld' } : {}),
      ...(condition === 'prefixed' ? { prefix: true } : {}), ...(condition === 'other role' ? { role: 'tool' } : {}),
      ...(condition === 'malformed arguments' ? { tool_calls: [{ ...call, function: { ...call.function, arguments: '{"path":' } }] } : {}) } }],
    reasoningSignature: shape.readBody(wire).reasoningSignature });
    expect(decoded.reasoningSignature).toBeUndefined();
    expect(decoded.reasoning).toMatch(/^First thought\./);
    expect(decoded.choices?.[0]?.message?.content).toMatch(/^Before /);
    expect(decoded.usage).toEqual(wire.usage);
    if (condition === 'malformed arguments') expect(toStep(decoded, {})).toMatchObject({ stopReason: 'error', toolCalls: [] });
    if (condition === 'model_length') expect(decoded.choices?.[0]?.finish_reason).toBe('length');
  });

it('rejects in-band errors without propagating response detail', () => {
  expect(() => shape.readBody({ ...wire, error: { type: 'authentication_error', message: 'opaque fixture detail' } }))
    .toThrow(/^Provider reported an error: provider_auth\. Response details withheld\.$/);
});

it.each(['provider', 'model', 'credential', 'answer', 'reasoning', 'args', 'call', 'redacted', 'invalid packet'] as const)(
  'projects normal chat content after %s changes', changed => {
    const output = toStep(shape.readBody(wire), {});
    const history: ChatMessage = { role: 'assistant', content: changed === 'answer' ? 'Edited' : output.text,
      reasoning: { text: changed === 'reasoning' ? 'Edited' : output.reasoning!.text,
        signature: changed === 'invalid packet' ? '{"protocol":"mistral-chat-completions","version":1}' : output.reasoning!.signature,
        ...(changed === 'redacted' ? { redacted: true } : {}) },
      origin: { provider: target.provider, model: target.model, replayBinding: binding },
      tool_calls: [{ ...call, id: changed === 'call' ? 'New123456' : call.id,
        function: { ...call.function, arguments: changed === 'args' ? '{"path":"other.txt"}' : call.function.arguments } }] };
    const input = { ...target, provider: changed === 'provider' ? 'different' : target.provider,
      model: changed === 'model' ? 'different' : target.model,
      replayBinding: changed === 'credential' ? requestReplayBinding({ ...target, headers: { authorization: 'Bearer synthetic-rotated' } }) : binding,
      messages: [history] };
    expect(endpointBody(endpoint, input).messages).toEqual([{ role: 'assistant', content: history.content, tool_calls: history.tool_calls }]);
  });

it('keeps each original assistant bound when the shared builder inserts a bridge after a tool image', () => {
  const text = 'I have processed the tool results.';
  const native = [content[1]!, { type: 'text', text }];
  const output = toStep(shape.readBody({ choices: [{ message: { content: native }, finish_reason: 'stop' }] }), {});
  const messages: ChatMessage[] = [{ role: 'assistant', content: '', tool_calls: [call] },
    { role: 'tool', tool_call_id: call.id, content: [{ type: 'image', data: 'AA==', mimeType: 'image/png' }] },
    { role: 'assistant', content: output.text, reasoning: output.reasoning,
      origin: { provider: target.provider, model: target.model, replayBinding: binding } }];
  const input: TurnRequest = { ...target, messages, replayBinding: binding, systemPrompt: 'brief', systemRole: 'system',
    tools: [], allowTools: false, vision: true, assistantAfterToolResult: true, reasoningEffort: false, maxTokensField: 'max_tokens', temperature: 0.2 };
  const result = endpointTurnBody(endpoint, input).messages as Record<string, unknown>[];
  expect(result.filter(message => message.role === 'assistant').map(message => message.content)).toEqual(['', text, native]);
  expect((endpointTurnBody('openai-compatible', input).messages as Record<string, unknown>[]).at(-1)?.content).toBe(text);
});
