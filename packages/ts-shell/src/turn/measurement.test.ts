import { afterEach, expect, it } from 'vitest';
import type { AgentMessage } from '../core/agent/state.js';
import { microcompactMessages, pruneToolContent } from '../core/query/microCompact.js';
import { estimatePrompt } from '../context/request/estimate.js';
import { historyDigest, requestIdentity } from '../context/request/identity.js';
import { estimateTokens } from '../session/context.js';
import { getSessionUsage, resetSessionUsage } from '../observability/usageTelemetry.js';
import { measuredProjectionPrefix } from './measurement.js';
import { FINAL_STEP_MESSAGE, outgoingProjection } from './messages.js';
import { createStepFunction } from './step.js';

const sessionId = 'rewritten-measurement';
const overhead = { systemPrompt: 'system', tools: [] };
const identity = { provider: 'openai', model: 'm', endpoint: 'openai-compatible', endpointId: 'a'.repeat(64),
  ...requestIdentity(overhead), replayBinding: 'b'.repeat(64) };
const turn = (index: number): AgentMessage[] => [
  { role: 'user', content: `question ${index}` },
  { role: 'assistant', content: '', tool_calls: [{ id: `call-${index}`, type: 'function',
    function: { name: 'read', arguments: '{}' } }] },
  { role: 'tool', content: `${index}:` + 'x'.repeat(5000), tool_call_id: `call-${index}` },
];
const anchor = (messages: AgentMessage[], tokens = 20_000) => {
  const original = outgoingProjection(messages, false);
  return { ...getSessionUsage(sessionId), lastPromptTokens: tokens, lastPromptMessageCount: messages.length,
    lastPromptIdentity: { ...identity, historyDigest: historyDigest(messages),
      wireHistoryDigest: historyDigest(original.messages), wireMessageCount: messages.length,
      wireRewriteTokens: Math.ceil(original.savedChars / 3.5) } };
};
afterEach(() => resetSessionUsage(sessionId));

it('keeps pruning idempotent while retaining text that merely mentions an omission', () => {
  const pruned = pruneToolContent('a'.repeat(5000));
  expect(pruneToolContent(pruned)).toBe(pruned);
  const history = [ ...turn(0), ...turn(1), ...turn(2), ...turn(3), ...turn(4) ];
  const once = microcompactMessages(history);
  const twice = microcompactMessages(once.messages);
  expect(twice.messages).toEqual(once.messages);
  expect(twice.savedChars).toBe(0);
  const distinct = history.map(message => message.role === 'tool'
    ? { ...message, content: 'h'.repeat(500) + message.content + 't'.repeat(500) } : message);
  const projected = microcompactMessages(distinct);
  expect(microcompactMessages(projected.messages).messages).toEqual(projected.messages);
  expect(pruneToolContent('a'.repeat(1000) + pruned + 'b'.repeat(1000))).not.toBe('a'.repeat(1000) + pruned + 'b'.repeat(1000));
});

it('subtracts only new measured-prefix rewrites from an already compacted provider anchor', () => {
  const old = [...turn(0), ...turn(1), ...turn(2), ...turn(3), ...turn(4)];
  const usage = anchor(old);
  const current = [...old, ...turn(5), ...turn(6)];
  const projection = outgoingProjection(current, false);
  const prefixIdentity = measuredProjectionPrefix(current, projection, usage, false)!;
  const oldWire = outgoingProjection(old, false).messages;
  const removed = oldWire.reduce((sum, message, index) => sum + (message.content as string).length
    - (projection.messages[index]!.content as string).length, 0);
  expect(prefixIdentity.rewriteTokensRemoved).toBe(Math.floor(removed / 3.5));
  expect(prefixIdentity.rewriteTokensRemoved).toBeGreaterThan(0);
  expect(prefixIdentity.rewriteTokensRemoved).toBeLessThan(Math.floor(projection.savedChars / 3.5));
  const projected = { tokens: 999, method: 'o200k_base' as const, prefixIdentity,
    tailMessages: projection.messages.slice(old.length).map(message => ({ ...message, content: message.content ?? '' })) };
  const result = estimatePrompt(current, overhead, { ...identity, wireHistoryDigest: historyDigest(projection.messages),
    wireMessageCount: current.length }, usage, projected);
  expect(result).toMatchObject({ source: 'calibrated', method: 'characters/3.5',
    tokens: 20_000 - Math.floor(removed / 3.5) + estimateTokens(projected.tailMessages) });
  expect(estimatePrompt(current, overhead, result.identity, usage, projected).tokens).toBe(result.tokens);
  expect(usage.lastPromptTokens).toBe(20_000);
  expect(measuredProjectionPrefix(old, outgoingProjection(old, false), usage, false)?.rewriteTokensRemoved).toBe(0);
});

it('does not subtract newly pruned unmeasured outputs from the provider prefix', () => {
  const old = turn(0);
  const current = [...old, ...turn(1), ...turn(2), ...turn(3), ...turn(4), ...turn(5)];
  const usage = anchor(old);
  const projected = outgoingProjection(current, false);
  const proof = measuredProjectionPrefix(current, projected, usage, false)!;
  expect(proof.rewriteTokensRemoved).toBeLessThan(Math.floor(projected.savedChars / 3.5));
});

it.each([
  ['equals', 0], ['exceeds', 1],
] as const)('rejects a measured-prefix rewrite whose removal %s its provider anchor', (_relation, excess) => {
  const old = turn(0);
  const current = [...old, ...turn(1), ...turn(2), ...turn(3), ...turn(4)];
  const projection = outgoingProjection(current, false);
  const removedTokens = Math.floor(((old[2]!.content as string).length
    - (projection.messages[2]!.content as string).length) / 3.5);
  expect(removedTokens).toBeGreaterThan(1);
  // A positive remainder is valid even when a character estimate would suggest
  // a larger retained prefix. Only an exhausted anchor invalidates the proof.
  expect(measuredProjectionPrefix(current, projection, anchor(old, removedTokens + 1), false))
    .toMatchObject({ rewriteTokensRemoved: removedTokens });
  expect(measuredProjectionPrefix(current, projection, anchor(old, removedTokens - excess), false)).toBeUndefined();
});

it.each([undefined, -1, 0, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
  'rejects an absent or invalid provider anchor before proving a rewrite (%s)', lastPromptTokens => {
    const old = turn(0);
    const usage = { ...anchor(old), lastPromptTokens };
    expect(measuredProjectionPrefix(old, outgoingProjection(old, false), usage, false)).toBeUndefined();
  });

it('rejects changed source, baseline, wire, bridge, image, opaque and balanced conversion identities', () => {
  const old = turn(0), usage = anchor(old);
  const current = [...old, ...turn(1), ...turn(2), ...turn(3)];
  expect(measuredProjectionPrefix([{ ...current[0]!, content: 'replaced' }, ...current.slice(1)],
    outgoingProjection(current, false), usage, false)).toBeUndefined();
  for (const changed of [{ wireHistoryDigest: 'c'.repeat(64) }, { wireRewriteTokens: 99 }, { wireMessageCount: old.length + 1 }]) {
    expect(measuredProjectionPrefix(current, outgoingProjection(current, false),
      { ...usage, lastPromptIdentity: { ...usage.lastPromptIdentity, ...changed } }, false)).toBeUndefined();
  }
  expect(measuredProjectionPrefix(current, outgoingProjection(current, true), usage, true)).toBeUndefined();
  for (const extra of [{ role: 'user' as const, content: [{ type: 'image' as const, mimeType: 'image/png', data: 'AA==' }] },
    { role: 'assistant' as const, content: 'answer', reasoning: { text: 'secret', signature: 'opaque' } },
    { role: 'assistant' as const, content: 'answer', origin: { provider: 'other', model: 'm', replayBinding: 'different' } }]) {
    expect(measuredProjectionPrefix([...old, extra], outgoingProjection([...old, extra], false), usage, false)).toBeUndefined();
  }
  const malformed: AgentMessage[] = [old[0]!, { role: 'tool', content: 'orphan', tool_call_id: 'missing' }, old[1]!];
  const repaired = outgoingProjection(malformed, false);
  expect(repaired.messages).toHaveLength(malformed.length);
  expect(repaired.indexAligned).toBe(false);
});

it('uses actual dispatch usage for rewritten request admission instead of a whole-history estimate', async () => {
  const old = [...turn(0), ...turn(1), ...turn(2), ...turn(3), ...turn(4)];
  let sends = 0;
  const step = createStepFunction({ sessionId, workspaceRoot: process.cwd(), systemPrompt: overhead.systemPrompt,
    provider: { provider: 'openai', model: 'm', baseUrl: 'https://fixture.invalid/v1', apiKey: 'synthetic' },
    tools: [], contextWindow: 14_000, reserveTokens: 0, maxOutputTokens: 1,
    fetchImpl: async () => { sends++; return new Response(JSON.stringify({
      choices: [{ message: { content: 'answer' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 20_000, completion_tokens: 1 },
    }), { headers: { 'content-type': 'application/json' } }); } });
  expect((await step(old, undefined, {}, { allowTools: true })).stopReason).toBe('stop');
  expect(getSessionUsage(sessionId).lastPromptIdentity?.wireRewriteTokens).toBeGreaterThan(0);
  // This local estimate fits, but the corrected provider anchor remains larger.
  const outcome = await step([...old, ...turn(5)], undefined, {}, { allowTools: true });
  expect(outcome.stopReason).toBe('error');
  expect(outcome.errorMessage).toMatch(/^Context overflow:/);
  expect(sends).toBe(1);
});

it('does not add the closing instruction twice to an identical full-wire provider anchor', () => {
  const raw = turn(0), usage = anchor(raw, 700);
  const wire = [...outgoingProjection(raw, false).messages, { role: 'user' as const, content: FINAL_STEP_MESSAGE }];
  const full = { ...usage.lastPromptIdentity, wireMessageCount: wire.length, wireHistoryDigest: historyDigest(wire) };
  const result = estimatePrompt(raw, overhead, full, { ...usage, lastPromptIdentity: full }, {
    tokens: 999, method: 'o200k_base', tailMessages: wire.slice(raw.length).map(message => ({ ...message, content: message.content ?? '' })) });
  expect(result).toMatchObject({ source: 'calibrated', tokens: 700 });
});
