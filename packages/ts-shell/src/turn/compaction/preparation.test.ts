import { afterEach, expect, it, vi } from 'vitest';
import type { AgentMessage } from '../../core/agent/state.js';
import type { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import type { QueryEvent } from '../../core/query/runtime/events.js';
import { resetSessionUsage } from '../../observability/usageTelemetry.js';
import { runTurn } from '../session.js';
import { createStepFunction } from '../step.js';

const hooks = { dispatch: async () => ({ decision: 'allow', stopChecks: [] }) } as unknown as HookDispatcher;
let count = 0;
const sessions: string[] = [];
afterEach(() => { for (const session of sessions.splice(0)) resetSessionUsage(session); });

async function run(input: {
  readonly rawSize: number;
  readonly wire: (messages: readonly AgentMessage[], candidate: boolean) => string;
  readonly maxRequestBytes?: number;
  readonly response?: (attempt: number) => Response;
  readonly maxSteps?: number;
  readonly withTools?: boolean;
  readonly onCandidate?: () => void;
  readonly continuation?: boolean;
}) {
  const sessionId = `context-admission-${++count}`; sessions.push(sessionId);
  const calls: { candidate: boolean; text: string }[] = [];
  const bodies: string[] = [];
  const publications = vi.fn();
  const summarize = vi.fn(async () => 'Captured previous work.');
  const converter = vi.fn((messages: readonly AgentMessage[]) => {
    const candidate = messages.some(message => String(message.content).includes('[Context Checkpoint]'));
    if (candidate) input.onCandidate?.();
    const text = input.wire(messages, candidate); calls.push({ candidate, text });
    return [{ role: 'system' as const, content: 'Converted system.' }, { role: 'user' as const, content: text }];
  });
  const step = createStepFunction({ provider: { provider: 'fixture', model: 'model', headers: {}, baseUrl: 'https://fixture.test/v1' },
    sessionId, workspaceRoot: process.cwd(), systemPrompt: 'Base system.',
    tools: input.withTools ? [{ type: 'function', function: { name: 'read', parameters: { type: 'object' } } }] : [], maxOutputTokens: 10,
    contextWindow: 1800, reserveTokens: 0,
    catalog: [{ id: 'fixture', baseUrl: 'https://fixture.test/v1', models: [{ id: 'model',
      ...(input.maxRequestBytes ? { inputLimits: { maxRequestBytes: input.maxRequestBytes } } : {}) }] }],
    fetchImpl: async (_url, init) => {
      bodies.push(String(init?.body));
      return input.response?.(bodies.length) ?? new Response(JSON.stringify({ choices: [{ message: { content: 'done' }, finish_reason: 'stop' }] }),
        { headers: { 'content-type': 'application/json' } });
    } });
  const history: AgentMessage[] = Array.from({ length: 5 }, (_, index) => [
    { role: 'user' as const, content: `Work ${index}: ${'x'.repeat(input.rawSize)}` },
    { role: 'assistant' as const, content: `Result ${index}: ${'y'.repeat(input.rawSize)}` },
  ]).flat();
  const events: QueryEvent[] = [];
  for await (const event of runTurn({ sessionId, workspaceRoot: process.cwd(), prompt: 'Continue.', history,
    signal: new AbortController().signal, onMessage: () => {}, step,
    tools: new Map(input.withTools ? [['read', { name: 'read', description: 'Read', parameters: { type: 'object' }, execute: async () => ({ success: true, output: 'read' }) }]] : []),
    hooks, maxSteps: input.maxSteps ?? 3,
    ...(input.continuation ? { finishTurn: () => ({ action: bodies.length < 2 ? 'continue' as const : 'end' as const }) } : {}),
    retry: { enabled: false }, convertToLlm: converter,
    compaction: { policy: { contextWindow: 1800, reserveTokens: 0, outputTokens: 10, keepRecentTokens: 10 },
      summarize, onCompact: publications },
  }).events) events.push(event);
  return { calls, bodies, publications, summarize, converter, events };
}

it('keeps raw-large history when its complete converted request is small', async () => {
  const result = await run({ rawSize: 1000, wire: () => 'Small converted history.' });
  expect(result.summarize).not.toHaveBeenCalled(); expect(result.publications).not.toHaveBeenCalled();
  expect(result.converter).toHaveBeenCalledTimes(1); expect(result.calls).toEqual([{ candidate: false, text: 'Small converted history.' }]);
  expect(result.bodies).toHaveLength(1); expect(result.events.some(event => event.type === 'query.failed')).toBe(false);
});

it('prices overflow recovery with the next closing step contract before publishing', async () => {
  const result = await run({ rawSize: 20, maxSteps: 2, withTools: true,
    wire: (_messages, candidate) => candidate ? 'Recovered closing request.' : 'Original input '.repeat(50),
    response: attempt => attempt === 1 ? new Response('maximum context length exceeded', { status: 400 })
      : new Response(JSON.stringify({ choices: [{ message: { content: 'done' }, finish_reason: 'stop' }] }),
        { headers: { 'content-type': 'application/json' } }) });
  expect(result.publications).toHaveBeenCalledOnce(); expect(result.bodies).toHaveLength(2);
  const body = JSON.parse(result.bodies[1]!);
  expect(body.tools).toBeUndefined(); expect(body.messages.at(-1)?.content).toContain('You have reached the limit of steps');
  expect(result.converter).toHaveBeenCalledTimes(2);
});

it('uses accepted raw history on a continuation after compaction', async () => {
  const result = await run({ rawSize: 20, continuation: true, wire: (_messages, candidate) => candidate ? 'Accepted history.' : 'a'.repeat(8000) });
  expect(result.publications).toHaveBeenCalledOnce(); expect(result.bodies).toHaveLength(2);
  expect(result.calls.map(call => call.candidate)).toEqual([false, true, true]);
});

it('compacts raw-small history from its complete converted size and sends the captured candidate', async () => {
  const result = await run({ rawSize: 20, wire: (_messages, candidate) => candidate ? 'Candidate capture 2.' : 'a'.repeat(8000) });
  expect(result.summarize).toHaveBeenCalledOnce(); expect(result.publications).toHaveBeenCalledOnce();
  expect(result.converter).toHaveBeenCalledTimes(2); expect(result.calls.map(call => call.candidate)).toEqual([false, true]);
  expect(result.bodies).toHaveLength(1); expect(result.bodies[0]).toContain('Candidate capture 2.');
  expect(result.events.some(event => event.type === 'query.failed')).toBe(false);
});

it('retains durable history when candidate conversion grows', async () => {
  const result = await run({ rawSize: 1000, wire: (_messages, candidate) => 'a'.repeat(candidate ? 10000 : 8000) });
  expect(result.summarize).toHaveBeenCalledOnce(); expect(result.publications).not.toHaveBeenCalled();
  expect(result.calls.map(call => call.candidate)).toEqual([false, true]); expect(result.bodies).toEqual([]);
  expect(result.events.some(event => event.type === 'query.failed')).toBe(true);
});

it('rejects a smaller candidate with a complete serialized byte refusal before publication', async () => {
  const result = await run({ rawSize: 1000, maxRequestBytes: 400,
    wire: (_messages, candidate) => candidate ? 'b'.repeat(1000) : 'a'.repeat(8000) });
  expect(result.publications).not.toHaveBeenCalled(); expect(result.bodies).toEqual([]);
  expect(result.calls.map(call => call.candidate)).toEqual([false, true]);
});

it('recovers a real provider overflow once with the already prepared candidate projection', async () => {
  const result = await run({ rawSize: 20, wire: (_messages, candidate) => candidate ? 'Recovered captured request.' : 'Original small request. '.repeat(10),
    response: attempt => attempt === 1 ? new Response('maximum context length exceeded', { status: 400 })
      : new Response(JSON.stringify({ choices: [{ message: { content: 'done' }, finish_reason: 'stop' }] }),
        { headers: { 'content-type': 'application/json' } }) });
  expect(result.summarize).toHaveBeenCalledOnce(); expect(result.publications).toHaveBeenCalledOnce();
  expect(result.converter).toHaveBeenCalledTimes(2); expect(result.bodies).toHaveLength(2);
  expect(result.bodies[1]).toContain('Recovered captured request.');
});
