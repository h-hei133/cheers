import { expect, it } from 'vitest';
import type { AgentMessage } from '../../core/agent/state.js';
import { CHARS_PER_TOKEN, estimateTokens } from '../../session/context.js';
import { endpointBody, endpointShape } from '../../provider/endpoints/index.js';
import { estimatePromptTail, type PromptTailContext } from './tail.js';

const context: PromptTailContext = { endpoint: 'openai-compatible', provider: 'fixture', model: 'm',
  replayBinding: 'a'.repeat(64), reasoningReplayField: 'reasoning_content' };
const message: AgentMessage = { role: 'assistant', content: 'answer', reasoning: { text: 'Public\nreasoning '.repeat(3000) },
  origin: { provider: context.provider, model: context.model, replayBinding: context.replayBinding },
  tool_calls: [{ id: 'call', type: 'function', function: { name: 'read', arguments: '{}' } }] };

it('adds the actual declared public reasoning projection to ordinary tail tokens', () => {
  const messages = [message, { role: 'tool' as const, content: 'result', tool_call_id: 'call' }];
  const replayed = endpointBody(context.endpoint, { ...context, messages });
  const ordinary = endpointBody(context.endpoint, { ...context,
    messages: messages.map(entry => ({ ...entry, reasoning: undefined })) });
  const extraChars = JSON.stringify(replayed.messages).length - JSON.stringify(ordinary.messages).length;
  expect(estimatePromptTail(messages, context)).toBe(estimateTokens(messages) + Math.ceil(extraChars / CHARS_PER_TOKEN));
  expect(estimatePromptTail(messages, context)).toBeGreaterThan(12_000);
  expect(JSON.stringify(replayed.messages)).toContain('reasoning_content');
});

it.each(['undeclared', 'invalid field', 'different provider', 'different model', 'different binding', 'missing origin'])(
  'adds no reasoning omitted by the actual protocol: %s', mismatch => {
    const selected = { ...context,
      ...(mismatch === 'undeclared' ? { reasoningReplayField: undefined } : {}),
      ...(mismatch === 'invalid field' ? { reasoningReplayField: 'signature' as never } : {}),
      ...(mismatch === 'different provider' ? { provider: 'other' } : {}),
      ...(mismatch === 'different model' ? { model: 'other' } : {}),
      ...(mismatch === 'different binding' ? { replayBinding: 'b'.repeat(64) } : {}) };
    const selectedMessage = mismatch === 'missing origin' ? { ...message, origin: undefined } : message;
    expect(estimatePromptTail([selectedMessage], selected)).toBe(estimateTokens([selectedMessage]));
  });

it.each(['anthropic-messages', 'copilot-messages', 'google-generative-ai'])(
  'counts unsigned public reasoning replayed by %s without a declared compatibility field', endpoint => {
    const selected = { ...context, endpoint, reasoningReplayField: undefined };
    const body = endpointBody(endpoint, { ...selected, messages: [message] });
    const field = endpointShape(endpoint).contextFields!.conversation;
    expect(JSON.stringify(body[field])).toContain('Public');
    expect(estimatePromptTail([message], selected)).toBeGreaterThan(12_000);
  });

it.each(['openai-responses', 'bedrock-converse-stream'])(
  'adds no unsigned reasoning when %s omits it', endpoint => {
    expect(estimatePromptTail([message], { ...context, endpoint })).toBe(estimateTokens([message]));
  });

it.each([{ signature: 'opaque' }, { signature: '' }, { redacted: true }])(
  'refuses opaque or signed reasoning rather than treating it as additive public text: %s', opaque => {
    expect(estimatePromptTail([{ ...message, reasoning: { ...message.reasoning!, ...opaque } }], context)).toBeUndefined();
  });

it('requires a usable protocol projection whenever the tail carries reasoning', () => {
  expect(estimatePromptTail([message])).toBeUndefined();
  expect(estimatePromptTail([message], { ...context, endpoint: 'unavailable-test-endpoint' })).toBeUndefined();
  expect(estimatePromptTail([{ role: 'user', content: 'ordinary' }])).toBe(3);
});
