import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import type { HookDispatcher } from '../core/hooks/hookDispatcher.js';
import type { CommandContext } from '../core/commands/types.js';
import { runTraceCommand } from '../core/commands/traceCommandRuntime.js';
import { RotatingFileSink, setGlobalRotatingFileSink } from '../observability/rotatingFileSink.js';
import { closeTraceDashboard, traceDashboardStatus } from '../observability/traceDashboard.js';
import { JsonlTraceStore } from '../observability/tracing/jsonlStore.js';
import { InMemoryTraceStore } from '../observability/tracing/span.js';
import type { TelemetryContext, TelemetrySpan } from '../observability/tracing/types.js';
import { resetSessionUsage } from '../observability/usageTelemetry.js';
import { runTurn, type TurnOptions } from './session.js';
import { createStepFunction, type StepFunction } from './step.js';

const directories: string[] = [];
const quietHooks = { dispatch: async () => ({ decision: 'allow', stopChecks: [] }) } as unknown as HookDispatcher;
afterEach(async () => {
  await closeTraceDashboard();
  setGlobalRotatingFileSink(null);
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
  resetSessionUsage('trace-cancel');
});

function setup(step: StepFunction, overrides: Partial<TurnOptions> = {}): TurnOptions {
  return { sessionId: 'trace-run', workspaceRoot: process.cwd(), prompt: 'Inspect fixture', history: [],
    permissionScope: 'allow-all', onMessage: () => {}, step, tools: new Map(), hooks: quietHooks,
    maxSteps: 3, signal: new AbortController().signal, ...overrides };
}

async function drain(options: TurnOptions): Promise<void> {
  for await (const _event of runTurn(options).events) { /* Observe the actual turn settlement. */ }
}

function carrierFailureRecorder(failingName: 'session.run' | 'provider.request'): TelemetryContext {
  const source = new InMemoryTraceStore();
  const carrier: Record<string, string> = failingName === 'session.run'
    ? { get 'cheers-trace-id'(): string { throw new Error('carrier getter failed'); } }
    : new Proxy({}, { get() { throw new Error('carrier proxy failed'); } });
  const wrap = (span: TelemetrySpan, name: string): TelemetrySpan => ({
    ...span,
    propagation: {
      inject: () => name === failingName ? carrier : source.inject(span),
      extract: input => source.extract(input),
    },
    startSpan: (options, callback) => span.startSpan(options, child => callback(wrap(child, options.name))),
  });
  return { startSpan: (options, callback) => source.startSpan(options, span => callback(wrap(span, options.name))) };
}

it.each(['session.run', 'provider.request'] as const)('keeps real turn execution and completion when %s returns a throwing carrier', async failingName => {
  let calls = 0;
  const step: StepFunction = async (_messages, _signal, listener) => {
    calls++;
    listener.onText?.('Product answer.');
    return { text: 'Product answer.', toolCalls: [], stopReason: 'stop' };
  };
  const events = [];
  for await (const event of runTurn(setup(step, { telemetry: carrierFailureRecorder(failingName) })).events) events.push(event);
  expect(calls).toBe(1);
  expect(events).toContainEqual(expect.objectContaining({ type: 'message.delta', delta: 'Product answer.' }));
  expect(events.at(-1)).toMatchObject({ type: 'query.completed', result: { finalOutput: 'Product answer.' } });
  expect(events.some(event => event.type === 'query.failed')).toBe(false);
});

it('records actual session, requests and tool execution in ordinary logs read by /trace', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-tracing-'));
  directories.push(directory);
  const sink = new RotatingFileSink({ logDir: directory });
  setGlobalRotatingFileSink(sink);
  const store = new JsonlTraceStore({ sink, sessionId: 'trace-run' });
  let calls = 0;
  const step: StepFunction = async (_messages, _signal, listener) => {
    if (++calls === 1) return { text: '', toolCalls: [{ id: 'lookup-call', name: 'fixture_lookup', args: {} }], stopReason: 'stop' };
    listener.onText?.('Observed fixture.');
    return { text: 'Observed fixture.', toolCalls: [], stopReason: 'stop' };
  };
  await drain(setup(step, { telemetry: store, tools: new Map([['fixture_lookup', {
    name: 'fixture_lookup', description: 'inspect fixture', argsSchema: { type: 'object' },
    execute: async () => ({ success: true, output: 'fixture bytes' }),
  }]]) }));
  const spans = store.readAllSpans();
  expect(spans.map(span => span.name)).toEqual(expect.arrayContaining(['session.run', 'provider.request', 'tool.execute']));
  expect(new Set(spans.map(span => span.traceId)).size).toBe(1);
  const root = spans.find(span => span.name === 'session.run')!;
  const tool = spans.find(span => span.name === 'tool.execute')!;
  const request = spans.find(span => span.name === 'provider.request' && span.attributes.requestId === tool.attributes.requestId)!;
  expect(tool.parentId).toBe(root.id);
  expect(tool.links).toContainEqual({ traceId: request.traceId, spanId: request.id });
  expect(request.attributes.usage).toBe('unknown');
  expect(sink.getFiles().every(file => file.endsWith('.log'))).toBe(true);
  const command = await runTraceCommand([], { cwd: process.cwd(), sessionId: 'trace-run' } as CommandContext);
  expect(command.output).toContain('Trace dashboard listening');
  const response = await fetch(`${traceDashboardStatus()!.url}data`);
  const data = await response.json() as { coverage: { status: string }; rows: Array<{ component: string; requestId?: string; toolId?: string }> };
  expect(data.coverage.status).toBe('partial');
  expect(data.rows).toContainEqual(expect.objectContaining({ component: 'tool.execute', toolId: 'lookup-call', requestId: request.attributes.requestId,
    links: [{ traceId: request.traceId, spanId: request.id }] }));
});

it.each([200, 400])('projects accepted response events through the actual trace command (HTTP %i)', async status => {
  const root = '/tmp/cheers-test';
  fs.mkdirSync(root, { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, 'trace-response-'));
  directories.push(directory);
  const sink = new RotatingFileSink({ logDir: directory });
  setGlobalRotatingFileSink(sink);
  const store = new JsonlTraceStore({ sink, sessionId: 'trace-run' });
  const step = createStepFunction({ sessionId: 'trace-run', workspaceRoot: process.cwd(), systemPrompt: '', tools: [],
    provider: { provider: 'fixture', model: 'fixture', endpoint: 'openai-compatible', baseUrl: 'https://fixture.invalid/v1', headers: {} },
    fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: 'private fixture response' }, finish_reason: 'stop' }] }),
      { status, headers: { 'content-type': 'application/json' } }),
  });
  await drain(setup(step, { telemetry: store }));
  const request = store.readAllSpans().find(span => span.name === 'provider.request');
  expect(request?.status.status).toBe(status === 200 ? 'ok' : 'error');
  expect(request?.events).toEqual(status === 200 ? [expect.objectContaining({ name: 'response.accepted',
    attributes: { endpoint: 'openai-compatible' } })] : []);

  await runTraceCommand(['open'], { cwd: process.cwd(), sessionId: 'trace-run' });
  const url = traceDashboardStatus()!.url;
  const raw = await (await fetch(url + 'data')).text();
  const { rows } = JSON.parse(raw) as { rows: Array<{ spanId: string; events?: { timestamp: string }[] }> };
  const row = rows.find(item => item.spanId === request?.id);
  expect(row?.events).toEqual(status === 200 ? [expect.objectContaining({ name: 'response.accepted', endpoint: 'openai-compatible' })] : undefined);
  if (status === 200) {
    const timestamp = Date.parse(row!.events![0]!.timestamp);
    expect(timestamp).toBeGreaterThanOrEqual(Math.floor(request!.startedMs));
    expect(timestamp).toBeLessThanOrEqual(request!.endedMs);
  }
  const markup = await (await fetch(url)).text();
  expect(markup.includes('response.accepted')).toBe(status === 200);
  expect(raw + markup).not.toContain('private fixture response');
});

it('records accepted cancellation without usage as aborted and unknown', async () => {
  const controller = new AbortController();
  const store = new InMemoryTraceStore();
  let accepted!: () => void;
  const responseAccepted = new Promise<void>(resolve => { accepted = resolve; });
  const step = createStepFunction({ sessionId: 'trace-cancel', workspaceRoot: process.cwd(), systemPrompt: '', tools: [],
    provider: { provider: 'fixture', model: 'fixture', endpoint: 'openai-compatible', baseUrl: 'https://fixture.invalid/v1', headers: {} },
    fetchImpl: async (_url, init) => new Response(new ReadableStream<Uint8Array>({
      start(stream) {
        stream.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"prefix"}}]}\n\n'));
        init?.signal?.addEventListener('abort', () => stream.error(new Error('cancelled fixture')), { once: true });
        accepted();
      },
    }), { headers: { 'content-type': 'text/event-stream' } }),
  });
  const run = drain(setup(step, { sessionId: 'trace-cancel', signal: controller.signal, telemetry: store }));
  await responseAccepted;
  controller.abort();
  await run;
  const request = store.snapshot().find(span => span.name === 'provider.request')!;
  expect(request.attributes).toMatchObject({ outcome: 'aborted', usage: 'unknown' });
  expect(request.attributes.outputCount).toBeUndefined();
  expect(store.snapshot().find(span => span.name === 'session.run')!.attributes.outcome).toBe('aborted');
});
