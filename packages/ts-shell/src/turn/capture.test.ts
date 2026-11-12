import { afterEach, expect, it } from 'vitest';
import type { SessionMessage } from '../session/schema/sessionMessage.js';
import type { HookDispatcher } from '../core/hooks/hookDispatcher.js';
import { createStepFunction } from './step.js';
import { runTurn } from './session.js';
import { openingMessage } from './opening.js';
import { outgoingProjection } from './messages.js';
import { measuredProjectionPrefix, storedPromptProjection } from './measurement.js';
import { historyDigest, requestIdentity } from '../context/request/identity.js';
import { estimatePrompt } from '../context/request/estimate.js';
import { getSessionUsage, resetSessionUsage, restoreSessionUsage, totalTokens } from '../observability/usageTelemetry.js';
import { createMessageTranscriptEvent, transcriptEventToSessionMessage } from '../session/sessionEventCodec.js';
import type { ProviderUsage } from './completion.js';

const id = 'capture-measurement';
const provider = { provider: 'fixture', model: 'model', baseUrl: 'https://fixture.invalid/v1', headers: {} };
const overhead = { systemPrompt: 'Answer briefly.', tools: [] };
const hooks = { dispatch: async () => ({ decision: 'allow', stopChecks: [] }) } as unknown as HookDispatcher;
afterEach(() => resetSessionUsage(id));

it('keeps the selected text projection when removing only a transient opening', () => {
  const opening = openingMessage({ workspaceRoot: '/fixture', prompt: 'inspect' });
  const stored: SessionMessage = { role: 'user', content: 'inspect' };
  const tail: SessionMessage[] = [
    { role: 'assistant', content: '', tool_calls: [{ id: 'source', type: 'function',
      function: { name: 'read', arguments: '{}' } }] },
    { role: 'tool', content: 'source\n'.repeat(900), tool_call_id: 'source' },
    ...Array.from({ length: 4 }, (_, index): SessionMessage[] => [
      { role: 'user', content: `continue ${index}` }, { role: 'assistant', content: 'working' },
    ]).flat(),
  ];
  const messages = [opening, ...tail];
  const projection = outgoingProjection(messages, false, false);
  const canonical = storedPromptProjection(messages, projection, { opening, stored }, false, messages.length, false)!;
  expect(canonical.wireRewriteTokens).toBe(0);
  const storedMessages = [stored, ...tail];
  expect(canonical.wireHistoryDigest).toBe(historyDigest(outgoingProjection(storedMessages, false, false).messages));
  const usage = { ...getSessionUsage(id), lastPromptTokens: 9000, lastPromptMessageCount: messages.length,
    lastPromptIdentity: { ...requestIdentity(overhead), provider: 'fixture', model: 'model',
      historyDigest: historyDigest(messages), wireHistoryDigest: historyDigest(projection.messages),
      wireMessageCount: messages.length, wireRewriteTokens: 0 }, lastPromptProjection: canonical };
  expect(measuredProjectionPrefix(storedMessages, outgoingProjection(storedMessages, false, false), usage, false, false)
    ?.rewriteTokensRemoved).toBe(canonical.removedTokens);
  expect(measuredProjectionPrefix(storedMessages, outgoingProjection(storedMessages, false, true), usage, false, true))
    .toBeUndefined();
});

it('rejects unrelated stored prompts and a framing reduction that exhausts the measured anchor', async () => {
  const opening = openingMessage({ workspaceRoot: '/fixture', prompt: 'actual' });
  const messages = [opening]; const projection = outgoingProjection(messages, false);
  expect(storedPromptProjection(messages, projection, { opening, stored: { role: 'user', content: 'other' } }, false, 1))
    .toBeUndefined();
  const stored = { role: 'user' as const, content: 'actual' };
  const canonical = storedPromptProjection(messages, projection, { opening, stored }, false, 1)!;
  const usage = { ...getSessionUsage(id), lastPromptTokens: canonical.removedTokens, lastPromptMessageCount: 1,
    lastPromptIdentity: { ...requestIdentity(overhead), provider: 'fixture', model: 'model',
      historyDigest: historyDigest(messages), wireHistoryDigest: historyDigest(projection.messages), wireMessageCount: 1 },
    lastPromptProjection: canonical };
  expect(measuredProjectionPrefix([stored], outgoingProjection([stored], false), usage, false)).toBeUndefined();
});

it('carries the current response through the loop and codec, then calibrates the raw prompt after restart', async () => {
  const stored: SessionMessage = { id: 'user', role: 'user', content: 'hello' };
  const persisted: SessionMessage[] = [stored];
  let sent: SessionMessage[] = [];
  const step = createStepFunction({ provider, sessionId: id, workspaceRoot: '/fixture', ...overhead,
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(String(init?.body)); sent = body.messages;
      expect(JSON.stringify(body)).not.toContain('promptMeasurement');
      return new Response(JSON.stringify({ choices: [{ message: { content: 'answer' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 3000, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 1000 } } }),
      { headers: { 'content-type': 'application/json' } });
    } });
  const run = runTurn({ sessionId: id, workspaceRoot: '/fixture', prompt: 'hello', storedPrompt: stored,
    history: [], onMessage: message => persisted.push(message), step, tools: new Map(), hooks, maxSteps: 3,
    signal: new AbortController().signal });
  for await (const _event of run.events) { /* Drain the actual turn. */ }
  expect(persisted).toHaveLength(2);
  const measurement = persisted[1]!.promptMeasurement!;
  expect(measurement).toMatchObject({ tokens: 3000, messageCount: 1,
    projection: { historyDigest: historyDigest([stored]) } });
  expect(measurement.identity.historyDigest).not.toBe(measurement.projection!.historyDigest);
  expect(measurement.projection!.removedTokens).toBeGreaterThan(0);
  expect(JSON.stringify(measurement)).not.toContain('/fixture');
  expect(sent[1]!.content).toContain('[Environment Context:');
  expect(totalTokens(getSessionUsage(id))).toBe(3005);
  // A live run can still use its actual framed prefix without applying the
  // stored-history reduction a second time.
  const live = [openingMessage({ workspaceRoot: '/fixture', prompt: 'hello' }), persisted[1]!];
  expect(measuredProjectionPrefix(live, outgoingProjection(live, false), getSessionUsage(id), false)
    ?.rewriteTokensRemoved).toBe(0);
  const decoded = persisted.map(message => transcriptEventToSessionMessage(JSON.parse(JSON.stringify(
    createMessageTranscriptEvent({ ...message, timestamp: '2026-11-03T00:00:00Z' }))))!);
  resetSessionUsage(id);
  restoreSessionUsage(id, undefined, decoded);
  expect(totalTokens(getSessionUsage(id))).toBe(0);
  const current = [...decoded, openingMessage({ workspaceRoot: '/fixture', prompt: 'next' })];
  const projection = outgoingProjection(current, false);
  const usage = getSessionUsage(id);
  const proof = measuredProjectionPrefix(current, projection, usage, false)!;
  expect(proof.rewriteTokensRemoved).toBe(measurement.projection!.removedTokens);
  const estimate = estimatePrompt(current, overhead, { ...measurement.identity,
    historyDigest: historyDigest(current), wireHistoryDigest: historyDigest(projection.messages),
    wireMessageCount: current.length }, usage, { tokens: 9999, method: 'characters/3.5', prefixIdentity: proof });
  expect(estimate.source).toBe('calibrated');
  expect(estimate.tokens).toBeGreaterThan(3000 - proof.rewriteTokensRemoved);
  expect(estimate.tokens).toBeLessThan(3100);
  current[0] = { ...current[0]!, content: 'replaced' };
  expect(measuredProjectionPrefix(current, outgoingProjection(current, false), usage, false)).toBeUndefined();
  const changed = estimatePrompt(decoded, { ...overhead, systemPrompt: 'Changed' }, { ...measurement.identity,
    ...requestIdentity({ ...overhead, systemPrompt: 'Changed' }) }, usage);
  expect(changed.source).toBe('estimated');
});

it.each(['missing', 'completion-only', 'error', 'delegated'] as const)(
  'does not attach an old measurement to a %s response', async kind => {
    const source = [{ role: 'user' as const, content: 'hello' }];
    let responses = 0;
    const step = createStepFunction({ provider, sessionId: id, workspaceRoot: '/fixture', ...overhead,
      fetchImpl: async () => {
        responses++;
        const usage = responses === 1 || kind === 'delegated' ? { prompt_tokens: 3000, completion_tokens: 5 }
          : kind === 'completion-only' ? { completion_tokens: 5 } : undefined;
        return new Response(JSON.stringify({ choices: [{ message: { content: 'answer' }, finish_reason: 'stop' }], usage }),
          { status: responses > 1 && kind === 'error' ? 400 : 200, headers: { 'content-type': 'application/json' } });
      } });
    expect((await step(source, undefined, {}, { allowTools: true })).promptMeasurement?.tokens).toBe(3000);
    const next = await step(source, undefined, {}, { allowTools: true, ...(kind === 'delegated' ? { agentMode: 'build' } as const : {}) });
    expect(next.promptMeasurement).toBeUndefined();
  });

it.each<{
  name: string; finishReason: string; missingMessage?: boolean; usage: ProviderUsage;
  stopReason: 'stop' | 'length' | 'error'; anchor?: number; reported: number;
}>([
  { name: 'successful', finishReason: 'stop', usage: { prompt_tokens: 3000, completion_tokens: 5 },
    stopReason: 'stop', anchor: 3000, reported: 3005 },
  { name: 'length-limited', finishReason: 'length', usage: { prompt_tokens: 3000, completion_tokens: 5 },
    stopReason: 'length', anchor: 3000, reported: 3005 },
  { name: 'unsupported stop reason', finishReason: 'content_filter', usage: { prompt_tokens: 3000, completion_tokens: 5 },
    stopReason: 'error', reported: 3005 },
  { name: 'missing response message', finishReason: 'stop', missingMessage: true,
    usage: { prompt_tokens: 3000, completion_tokens: 5 }, stopReason: 'error', reported: 3005 },
  { name: 'cache-only', finishReason: 'stop', usage: { cache_read_input_tokens: 120 },
    stopReason: 'stop', reported: 120 },
  { name: 'fractional prompt count', finishReason: 'stop', usage: { prompt_tokens: 3000.5, completion_tokens: 5 },
    stopReason: 'stop', reported: 3005.5 },
  { name: 'unsafe prompt count', finishReason: 'stop', usage: { prompt_tokens: Number.MAX_SAFE_INTEGER + 1 },
    stopReason: 'stop', reported: Number.MAX_SAFE_INTEGER + 1 },
  { name: 'unsafe inclusive count', finishReason: 'stop',
    usage: { prompt_tokens: Number.MAX_SAFE_INTEGER, cache_read_input_tokens: 1 },
    stopReason: 'stop', reported: Number.MAX_SAFE_INTEGER + 1 },
])('uses one live and durable anchor gate for a $name response while retaining accounting', async scenario => {
  const source = [{ role: 'user' as const, content: 'hello' }];
  let responses = 0;
  const observed: ProviderUsage[] = [];
  const step = createStepFunction({ provider, sessionId: id, workspaceRoot: '/fixture', ...overhead,
    fetchImpl: async () => {
      const first = responses++ === 0;
      return new Response(JSON.stringify({
        choices: !first && scenario.missingMessage ? []
          : [{ message: { content: 'answer' }, finish_reason: first ? 'stop' : scenario.finishReason }],
        usage: first ? { prompt_tokens: 1000, completion_tokens: 5 } : scenario.usage,
      }), { headers: { 'content-type': 'application/json' } });
    } });
  expect((await step(source, undefined, {}, { allowTools: true })).promptMeasurement?.tokens).toBe(1000);
  const next = await step(source, undefined, {}, { allowTools: true, onRequestUsage: usage => observed.push(usage) });
  expect(next.stopReason).toBe(scenario.stopReason);
  expect(next.promptMeasurement?.tokens).toBe(scenario.anchor);
  const usage = getSessionUsage(id);
  expect(usage.lastPromptTokens).toBe(scenario.anchor);
  expect(usage.recentRequests.at(-1)?.kind).toBe(scenario.anchor === undefined ? 'usage-gap' : 'request');
  if (scenario.anchor === undefined) {
    expect(usage.lastPromptMessageCount).toBe(0);
    expect(usage.lastPromptIdentity).toBeUndefined();
    expect(usage.lastPromptProjection).toBeUndefined();
  } else {
    expect(usage.lastPromptMessageCount).toBe(next.promptMeasurement!.messageCount);
    expect(usage.lastPromptIdentity).toEqual(next.promptMeasurement!.identity);
  }
  expect(totalTokens(usage)).toBe(1005 + scenario.reported);
  expect(usage.turnsCount).toBe(2);
  expect(observed).toEqual([scenario.usage]);
});

it('keeps reported accounting when a display callback fails after a response', async () => {
  const step = createStepFunction({ provider, sessionId: id, workspaceRoot: '/fixture', ...overhead,
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'answer' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 3000, completion_tokens: 5 },
    }), { headers: { 'content-type': 'application/json' } }) });
  let observed = 0;
  const next = await step([{ role: 'user', content: 'hello' }], undefined,
    { onText: () => { throw new Error('Display unavailable'); } },
    { allowTools: true, onRequestUsage: () => { observed++; } });
  expect(next.stopReason).toBe('error');
  expect(next.promptMeasurement).toBeUndefined();
  expect(getSessionUsage(id).lastPromptTokens).toBeUndefined();
  expect(totalTokens(getSessionUsage(id))).toBe(3005);
  expect(observed).toBe(1);
});

it('clears a prior anchor when a stream is cancelled after reporting prompt usage', async () => {
  const controller = new AbortController();
  let responses = 0;
  const step = createStepFunction({ provider, sessionId: id, workspaceRoot: '/fixture', ...overhead,
    fetchImpl: async (_url, init) => {
      if (responses++ === 0) return new Response(JSON.stringify({
        choices: [{ message: { content: 'answer' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1000, completion_tokens: 5 },
      }), { headers: { 'content-type': 'application/json' } });
      return new Response(new ReadableStream<Uint8Array>({ start(stream) {
        stream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
          choices: [{ delta: { content: 'partial answer' } }], usage: { prompt_tokens: 3000 },
        })}\n\n`));
        init?.signal?.addEventListener('abort', () => stream.error(new Error('Request cancelled')), { once: true });
      } }), { headers: { 'content-type': 'text/event-stream' } });
    } });
  const source = [{ role: 'user' as const, content: 'hello' }];
  expect((await step(source, undefined, {}, { allowTools: true })).promptMeasurement?.tokens).toBe(1000);
  const next = await step(source, controller.signal, { onText: () => controller.abort() }, { allowTools: true });
  expect(next.stopReason).toBe('aborted');
  expect(next.promptMeasurement).toBeUndefined();
  expect(getSessionUsage(id).lastPromptTokens).toBeUndefined();
  expect(getSessionUsage(id).recentRequests.at(-1)?.kind).toBe('usage-gap');
  expect(totalTokens(getSessionUsage(id))).toBe(1005);
});
