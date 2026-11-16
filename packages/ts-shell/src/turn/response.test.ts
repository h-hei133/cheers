import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAgentLoop, type AssistantStep } from '../core/agent/loop.js';
import type { AgentLifecycleEvent } from '../core/agent/events.js';
import type { QueryEvent } from '../core/query/runtime/events.js';
import { getSessionUsage, resetSessionUsage } from '../observability/usageTelemetry.js';
import { createTurnRequest } from './request.js';
import { createStepFunction, type StepFunction, type StepListener } from './step.js';
import { EventChannel } from './stream.js';

let workspace: string;
const privateBody = 'PRIVATE_BODY_CANARY socket connection lost';

beforeEach(() => {
  const directory = path.join(os.tmpdir(), 'cheers-test');
  fs.mkdirSync(directory, { recursive: true });
  workspace = fs.mkdtempSync(path.join(directory, 'response-'));
  fs.mkdirSync(path.join(workspace, '.agents'));
  resetSessionUsage(path.basename(workspace));
  vi.useFakeTimers();
});

afterEach(async () => {
  await vi.runAllTimersAsync();
  vi.useRealTimers();
  resetSessionUsage(path.basename(workspace));
  fs.rmSync(workspace, { recursive: true, force: true });
});

function interruptedResponse(status: number, headers: Record<string, string>, delta?: Record<string, unknown>): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      if (delta) controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`));
      setTimeout(() => controller.error(new Error(privateBody)), 5);
    },
  }), { status, headers: { 'content-type': 'text/event-stream', ...headers } });
}

function retryRun(input: { providerRetries: number; response: (attempt: number) => Response; listener?: StepListener }) {
  let calls = 0;
  const counts = { accepted: 0, admitted: 0, executed: 0 };
  const events: AgentLifecycleEvent[] = [];
  const steps: AssistantStep[] = [];
  const sessionId = path.basename(workspace);
  const step = createStepFunction({
    provider: { provider: 'fixture', baseUrl: 'https://fixture.invalid/v1', model: 'fixture' },
    workspaceRoot: workspace, sessionId, systemPrompt: 'be brief',
    tools: [{ type: 'function', function: { name: 'write', parameters: { type: 'object' } } }],
    retry: { maxRetries: input.providerRetries, baseDelayMs: 1, maxDelayMs: 10000 },
    fetchImpl: async (_url, init) => {
      expect(init?.method).toBe('POST');
      return input.response(++calls);
    },
  });
  const observedStep: StepFunction = Object.assign(async (messages: Parameters<StepFunction>[0],
    signal: Parameters<StepFunction>[1], listener: StepListener, options: Parameters<StepFunction>[3]) => {
    const result = await step(messages, signal, {
      onText: delta => { listener.onText?.(delta); input.listener?.onText?.(delta); },
      onReasoning: delta => { listener.onReasoning?.(delta); input.listener?.onReasoning?.(delta); },
      onReasoningReplace: text => { listener.onReasoningReplace?.(text); input.listener?.onReasoningReplace?.(text); },
      onReplace: text => { listener.onReplace?.(text); input.listener?.onReplace?.(text); },
    }, { ...options, onRequestSent: sent => { counts.accepted++; options.onRequestSent?.(sent); } });
    steps.push(result);
    return result;
  }, { preparesContext: step.preparesContext });
  const pending = runAgentLoop([{ role: 'user', content: 'Inspect the response.' }], [], {
    retry: { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 10000 },
    streamStep: createTurnRequest({ step: observedStep, sessionId, maxSteps: 3 }, { stepCount: 0 },
      new EventChannel<QueryEvent>()),
    beforeToolCall: async () => { counts.admitted++; return undefined; },
    tools: [{ name: 'write', execute: async () => { counts.executed++; return { output: 'unexpected write', isError: false }; } }],
  }, event => { events.push(event); }, undefined);
  return { get calls() { return calls; }, counts, events, steps, pending, sessionId };
}

describe('HTTP retry decisions across provider and turn budgets', () => {
  it.each([
    { providerRetries: 0, status: 503, header: ' FaLsE ', expected: 1 },
    { providerRetries: 2, status: 503, header: ' FaLsE ', expected: 1 },
    { providerRetries: 0, status: 400, header: ' TrUe ', expected: 3 },
    { providerRetries: 2, status: 400, header: ' TrUe ', expected: 3 },
    { providerRetries: 0, status: 503, header: undefined, expected: 3 },
    { providerRetries: 2, status: 503, header: undefined, expected: 3 },
    { providerRetries: 0, status: 529, header: undefined, expected: 3 },
    { providerRetries: 2, status: 529, header: undefined, expected: 3 },
  ])('sends $expected POSTs for status $status, header $header and provider budget $providerRetries', async ({ providerRetries, status, header, expected }) => {
    const result = retryRun({ providerRetries, response: () => new Response('PRIVATE_READABLE_BODY', {
      status, headers: { ...(header ? { 'x-should-retry': header } : {}), 'retry-after-ms': '5' },
    }) });
    await vi.runAllTimersAsync();
    const messages = await result.pending;
    expect(result.calls).toBe(expected);
    expect(result.counts).toEqual({ accepted: 0, admitted: 0, executed: 0 });
    expect(messages.at(-1)?.stopReason).toBe('error');
    expect(JSON.stringify([result.steps, messages, result.events])).not.toContain('PRIVATE_READABLE_BODY');
  });

  it.each([
    { providerRetries: 0, status: 503, header: 'false', expected: 1 },
    { providerRetries: 2, status: 503, header: 'false', expected: 1 },
    { providerRetries: 0, status: 400, header: undefined, expected: 1 },
    { providerRetries: 2, status: 400, header: undefined, expected: 1 },
    { providerRetries: 0, status: 400, header: 'true', expected: 3 },
    { providerRetries: 2, status: 400, header: 'true', expected: 3 },
    { providerRetries: 0, status: 529, header: undefined, expected: 3 },
    { providerRetries: 2, status: 529, header: undefined, expected: 3 },
  ])('retains status $status and header $header after body failure under provider budget $providerRetries', async ({ providerRetries, status, header, expected }) => {
    const result = retryRun({ providerRetries, response: attempt => expected === 1 && attempt > 1
      ? Response.json({ choices: [{ message: { content: 'MUST_NOT_REPLAY' }, finish_reason: 'stop' }] })
      : interruptedResponse(status, { ...(header ? { 'x-should-retry': header } : {}), 'retry-after-ms': '5' }),
    });
    await vi.runAllTimersAsync();
    const messages = await result.pending;
    expect(result.calls).toBe(expected);
    expect(result.counts).toEqual({ accepted: 0, admitted: 0, executed: 0 });
    expect(result.steps.at(-1)).toMatchObject({ stopReason: 'error', failureClass: 'provider_endpoint',
      errorMessage: `Provider HTTP ${status}: provider_endpoint. Response details withheld.` });
    if (header === 'false') expect(result.steps[0]?.retriesExhausted).toBe(true);
    expect(messages.at(-1)?.stopReason).toBe('error');
    if (expected === 1) expect(result.events.some(event => event.type === 'retry_scheduled' || event.type === 'retry_attempt_start')).toBe(false);
    expect(JSON.stringify([result.steps, messages, result.events])).not.toContain('PRIVATE_BODY_CANARY');
  });
});

describe('accepted responses cannot replay after failed completion', () => {
  it.each([
    { providerRetries: 0, ending: 'silent' }, { providerRetries: 2, ending: 'silent' },
    { providerRetries: 0, ending: 'empty-body' }, { providerRetries: 2, ending: 'empty-body' },
    { providerRetries: 0, ending: 'text' }, { providerRetries: 2, ending: 'text' },
    { providerRetries: 0, ending: 'reasoning' }, { providerRetries: 2, ending: 'reasoning' },
  ] as const)('keeps $ending failed with one POST under provider budget $providerRetries', async ({ providerRetries, ending }) => {
    const text: string[] = [], reasoning: string[] = [];
    const result = retryRun({ providerRetries, listener: { onText: value => text.push(value), onReasoning: value => reasoning.push(value) },
      response: attempt => {
        // A weakened replay fence ends finitely with a second, observable request.
        if (attempt > 1) return Response.json({ choices: [{ message: { content: 'MUST_NOT_REPLAY' }, finish_reason: 'stop' }] });
        if (ending === 'silent') return Response.json({ choices: [{ message: { content: '' }, finish_reason: '503' }] });
        const delta = ending === 'empty-body' ? undefined : {
          [ending === 'text' ? 'content' : 'reasoning_content']: 'Already visible',
          tool_calls: [{ index: 0, id: 'unaccepted-write', type: 'function',
            function: { name: 'write', arguments: '{"path":"refused.txt","content":"must not dispatch"}' } }],
        };
        return interruptedResponse(200, { 'x-should-retry': 'true' }, delta);
      },
    });
    await vi.runAllTimersAsync();
    const messages = await result.pending;
    expect(result.calls).toBe(1);
    expect(result.counts).toEqual({ accepted: 1, admitted: 0, executed: 0 });
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({ text: ending === 'text' ? 'Already visible' : '', toolCalls: [],
      stopReason: 'error', retriesExhausted: true });
    expect(result.steps[0]?.reasoning).toEqual(ending === 'reasoning' ? { text: 'Already visible' } : undefined);
    expect(result.steps[0]?.origin?.replayBinding).toBeUndefined();
    expect(result.steps[0]?.reasoning?.signature).toBeUndefined();
    expect(messages.at(-1)).toMatchObject({ role: 'assistant', content: ending === 'text' ? 'Already visible' : '', stopReason: 'error' });
    expect(messages.at(-1)?.tool_calls).toBeUndefined();
    expect(text).toEqual(ending === 'text' ? ['Already visible'] : []);
    expect(reasoning).toEqual(ending === 'reasoning' ? ['Already visible'] : []);
    expect(result.events.some(event => event.type === 'retry_scheduled' || event.type === 'retry_attempt_start'
      || event.type === 'tool_execution_start')).toBe(false);
    expect(getSessionUsage(result.sessionId).lastPromptTokens).toBeUndefined();
    expect(getSessionUsage(result.sessionId).recentRequests.at(-1)?.kind).toBe('usage-gap');
    expect(JSON.stringify([result.steps, messages, result.events])).not.toContain('PRIVATE_BODY_CANARY');
  });
});
