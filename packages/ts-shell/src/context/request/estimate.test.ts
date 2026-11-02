import { expect, it } from 'vitest';
import { estimatePrompt } from './estimate.js';
import { historyDigest, requestIdentity } from './identity.js';
import { getSessionUsage } from '../../observability/usageTelemetry.js';
import type { AgentMessage } from '../../core/agent/state.js';

const prefix: AgentMessage[] = [{ role: 'user', content: 'first' }, { role: 'assistant', content: 'answer' }];
const overhead = { systemPrompt: 'system', tools: [] };
const identity = { provider: 'openai', model: 'm', endpoint: 'openai-compatible', endpointId: 'a'.repeat(64), ...requestIdentity(overhead) };
const usage = () => ({ ...getSessionUsage('estimate-fixture'), lastPromptTokens: 500, lastPromptMessageCount: prefix.length,
  lastPromptIdentity: { ...identity, historyDigest: historyDigest(prefix) } });

it('uses provider usage only for an unchanged text prefix and a proven destination', () => {
  const messages: AgentMessage[] = [...prefix, { role: 'user', content: 'next' }];
  expect(estimatePrompt(messages, overhead, identity, usage(), 800)).toMatchObject({ source: 'calibrated', tokens: 502 });
  const changes = [
    { ...identity, endpointId: 'b'.repeat(64) }, { ...identity, endpointId: undefined },
    { ...identity, model: 'other' }, { ...identity, schemaDigest: 'new' }, { ...identity, systemDigest: 'new' },
  ];
  for (const changed of changes) expect(estimatePrompt(messages, overhead, changed, usage(), 800))
    .toMatchObject({ source: 'estimated', tokens: 800 });
  expect(estimatePrompt([{ ...prefix[0]!, content: 'other' }, prefix[1]!, messages[2]!], overhead, identity, usage(), 800))
    .toMatchObject({ source: 'estimated', tokens: 800 });
});

it('keeps an unchanged tool-call and result history anchored to provider usage', () => {
  const tools: AgentMessage[] = [...prefix,
    { role: 'assistant', content: '', tool_calls: [{ id: 'call', type: 'function', function: { name: 'read', arguments: '{"path":"a"}' } }] },
    { role: 'tool', content: 'result', tool_call_id: 'call' },
  ];
  const measured = { ...usage(), lastPromptTokens: 30_000, lastPromptMessageCount: tools.length,
    lastPromptIdentity: { ...identity, historyDigest: historyDigest(tools) } };
  expect(estimatePrompt([...tools, { role: 'user', content: 'next' }], overhead, identity, measured, 6_290))
    .toMatchObject({ source: 'calibrated', tokens: 30_002 });
  expect(estimatePrompt([...tools.slice(0, -1), { ...tools.at(-1)!, content: 'compacted' }], overhead, identity, measured, 6_290))
    .toMatchObject({ source: 'estimated', tokens: 6_290 });
});

it('does not add calibrated counts through opaque reasoning or image transformations', () => {
  const variants: AgentMessage[] = [
    { role: 'assistant', content: 'answer', reasoning: { text: 'thought', signature: 'signed' } },
    { role: 'assistant', content: 'answer', reasoning: { text: 'thought', redacted: true } },
    { role: 'user', content: [{ type: 'image', mimeType: 'image/png', data: 'AA==' }] },
  ];
  for (const message of variants) expect(estimatePrompt([...prefix, message], overhead, identity, usage(), 800))
    .toMatchObject({ source: 'estimated', tokens: 800 });
});

it('calibrates a projected tool prefix only when its current wire representation is proven unchanged', () => {
  const tools: AgentMessage[] = [...prefix,
    { role: 'assistant', content: '', origin: { provider: identity.provider, model: identity.model, replayBinding: 'f'.repeat(64) },
      tool_calls: [{ id: 'call', type: 'function', function: { name: 'read', arguments: '{}' } }] },
    { role: 'tool', content: 'result', tool_call_id: 'call' },
  ];
  const anchor = { ...identity, historyDigest: historyDigest(tools), wireHistoryDigest: 'c'.repeat(64),
    wireMessageCount: tools.length, replayBinding: 'f'.repeat(64) };
  const measured = { ...usage(), lastPromptTokens: 30_000, lastPromptMessageCount: tools.length, lastPromptIdentity: anchor };
  const current = { ...anchor, wireHistoryDigest: 'd'.repeat(64), wireMessageCount: tools.length + 1 };
  const messages: AgentMessage[] = [...tools, { role: 'user', content: 'next' }];
  const projected = { tokens: 6_290, method: 'o200k_base' as const,
    prefixIdentity: { wireHistoryDigest: anchor.wireHistoryDigest, wireMessageCount: tools.length } };
  expect(estimatePrompt(messages, overhead, current, measured, projected))
    .toMatchObject({ source: 'calibrated', tokens: 30_002, method: 'characters/3.5' });
  expect(estimatePrompt(messages, overhead, current, measured, { ...projected, prefixIdentity: undefined }))
    .toMatchObject({ source: 'estimated', tokens: 6_290 });
  expect(estimatePrompt(messages, overhead, current, measured, { ...projected,
    prefixIdentity: { ...projected.prefixIdentity, wireHistoryDigest: 'e'.repeat(64) } }))
    .toMatchObject({ source: 'estimated', tokens: 6_290 });
  expect(estimatePrompt(messages, overhead, { ...current, replayBinding: '0'.repeat(64) }, measured, projected))
    .toMatchObject({ source: 'estimated', tokens: 6_290 });
  const foreignTools = tools.map(message => message.origin ? { ...message,
    origin: { ...message.origin, replayBinding: '0'.repeat(64) } } : message);
  const foreignMeasured = { ...measured,
    lastPromptIdentity: { ...anchor, historyDigest: historyDigest(foreignTools) } };
  expect(estimatePrompt([...foreignTools, messages.at(-1)!], overhead, current, foreignMeasured, projected))
    .toMatchObject({ source: 'estimated', tokens: 6_290 });
});

it('calibrates only an identical recorded wire request', () => {
  const wireIdentity = {
    ...identity,
    historyDigest: historyDigest(prefix),
    wireHistoryDigest: 'c'.repeat(64),
    wireMessageCount: prefix.length,
    replayBinding: 'f'.repeat(64),
  };
  const wireUsage = () => ({
    ...getSessionUsage('estimate-fixture'),
    lastPromptTokens: 500,
    lastPromptMessageCount: prefix.length,
    lastPromptIdentity: wireIdentity,
  });

  expect(estimatePrompt(prefix, overhead, wireIdentity, wireUsage(), 800))
    .toMatchObject({ source: 'calibrated', tokens: 500 });
  expect(estimatePrompt(prefix, overhead, {
    ...wireIdentity,
    wireHistoryDigest: 'd'.repeat(64),
  }, wireUsage(), 800)).toMatchObject({ source: 'estimated', tokens: 800 });
  expect(estimatePrompt(prefix, overhead, {
    ...wireIdentity,
    replayBinding: '0'.repeat(64),
  }, wireUsage(), 800)).toMatchObject({ source: 'estimated', tokens: 800 });
  expect(estimatePrompt([...prefix, { role: 'user', content: 'next' }], overhead, {
    ...wireIdentity,
    wireHistoryDigest: 'e'.repeat(64),
    wireMessageCount: prefix.length + 1,
  }, wireUsage(), 800))
    .toMatchObject({ source: 'estimated', tokens: 800 });
});

it('does not label a character-based prefix extrapolation as a declared tokenizer estimate', () => {
  const messages: AgentMessage[] = [...prefix, { role: 'user', content: 'next' }];
  expect(estimatePrompt(messages, overhead, identity, usage(), { tokens: 42, method: 'o200k_base' }))
    .toMatchObject({ source: 'estimated', tokens: 42, method: 'o200k_base' });
  const wireIdentity = { ...identity, historyDigest: historyDigest(prefix), wireHistoryDigest: 'c'.repeat(64), wireMessageCount: 2 };
  const exactUsage = { ...usage(), lastPromptIdentity: wireIdentity };
  expect(estimatePrompt(prefix, overhead, wireIdentity, exactUsage, { tokens: 42, method: 'o200k_base' }))
    .toMatchObject({ source: 'calibrated', tokens: 500, method: 'o200k_base' });
  expect(estimatePrompt(messages, overhead, wireIdentity, exactUsage, { tokens: 42, method: 'o200k_base' }))
    .toMatchObject({ source: 'estimated', tokens: 42, method: 'o200k_base' });
});

it.each([true, false])('calibrates public reasoning only with its actual replay projection (declared=%s)', declared => {
  const anchor = { ...identity, historyDigest: historyDigest(prefix), wireHistoryDigest: 'c'.repeat(64),
    wireMessageCount: prefix.length, replayBinding: 'f'.repeat(64) };
  const tail: AgentMessage = { role: 'assistant', content: 'answer', reasoning: { text: 'r'.repeat(40_000) },
    origin: { provider: identity.provider, model: identity.model, replayBinding: anchor.replayBinding } };
  const measured = { ...usage(), lastPromptTokens: 900, lastPromptIdentity: anchor };
  const current = { ...anchor, wireHistoryDigest: 'd'.repeat(64), wireMessageCount: prefix.length + 1 };
  const projected = { tokens: 14_000, method: 'o200k_base' as const,
    prefixIdentity: { wireHistoryDigest: anchor.wireHistoryDigest, wireMessageCount: prefix.length },
    tailContext: { endpoint: current.endpoint, provider: current.provider, model: current.model, replayBinding: current.replayBinding,
      ...(declared ? { reasoningReplayField: 'reasoning_content' as const } : {}) } };
  const result = estimatePrompt([...prefix, tail], overhead, current, measured, projected);
  expect(result).toMatchObject({ source: 'calibrated', method: 'characters/3.5' });
  if (declared) expect(result.tokens).toBeGreaterThan(12_000);
  else expect(result.tokens).toBe(902);
  expect(estimatePrompt([...prefix, tail], overhead, current, measured, { ...projected, tailContext: undefined }))
    .toMatchObject({ source: 'estimated', tokens: 14_000 });
});
