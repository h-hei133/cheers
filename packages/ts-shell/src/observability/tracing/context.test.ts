import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createComponentLogger, setStructuredLogSink } from '../structuredLogger.js';
import type { StructuredLogEntry } from '../types.js';
import { traceParentCarrier } from './carrier.js';
import { currentTrace, runTraceScope, traceOperation } from './context.js';
import { InMemoryTraceStore } from './span.js';
import { JsonlTraceStore } from './jsonlStore.js';
import { MAX_SPAN_BYTES } from './records.js';
import { recordSpan } from './safe.js';
import type { TelemetryContext, TelemetrySpan } from './types.js';

const temporary: string[] = [];

function carrierFailureRecorder(kind: 'getter' | 'proxy', failingName: string): TelemetryContext {
  const source = new InMemoryTraceStore();
  const carrier: Record<string, string> = kind === 'getter'
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

afterEach(() => {
  setStructuredLogSink(null);
  for (const directory of temporary.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('bound tracing', () => {
  it('links incoming trace context to run and child logs in the receiving scope', async () => {
    const store = new InMemoryTraceStore();
    const traceId = '1'.repeat(32);
    const parentId = '2'.repeat(16);
    const carrier = traceParentCarrier(`00-${traceId}-${parentId}-01`);
    const scope = { sessionId: 'receiver', workspaceRoot: '/receiver' };
    const logger = createComponentLogger('receiving-process');
    const logged: StructuredLogEntry[] = [];
    setStructuredLogSink(entry => logged.push(entry));

    await runTraceScope(store, scope, { name: 'session.run' }, async () => {
      logger.info('run');
      await traceOperation({ name: 'provider.request' }, () => logger.info('request'));
    }, carrier);

    const run = store.snapshot().find(span => span.name === 'session.run');
    expect(run).toMatchObject({ traceId, parentId, attributes: scope });
    expect(logged[0]).toMatchObject({ traceId, spanId: run?.id, parentSpanId: parentId, fields: scope });
    expect(logged[1]).toMatchObject({ traceId, parentSpanId: run?.id, fields: scope });
    expect(currentTrace()).toBeUndefined();
  });

  it('records a local root and preserves the product result when extraction throws', async () => {
    const store = new InMemoryTraceStore();
    const traceId = '1'.repeat(32);
    const recorder: TelemetryContext = {
      startSpan: (options, callback) => store.startSpan(options, callback),
      propagation: {
        inject: context => store.inject(context),
        extract: () => { throw new Error('fixture extraction failed'); },
      },
    };
    const carrier = traceParentCarrier(`00-${traceId}-${'2'.repeat(16)}-01`);
    const scope = { sessionId: 'receiver', workspaceRoot: '/receiver' };
    let calls = 0;

    await expect(runTraceScope(recorder, scope, { name: 'session.run' }, () => {
      expect(currentTrace()?.parentSpanId).toBeUndefined();
      return ++calls;
    }, carrier)).resolves.toBe(1);

    const [run] = store.snapshot();
    expect(run).toMatchObject({ name: 'session.run', attributes: scope });
    expect(run?.traceId).not.toBe(traceId);
    expect(run?.parentId).toBeUndefined();
    expect(calls).toBe(1);
  });

  it.each(['getter', 'proxy'] as const)('preserves the root callback value and original error with a throwing carrier %s', async kind => {
    const recorder = carrierFailureRecorder(kind, 'session.run');
    const scope = { sessionId: 'carrier-root', workspaceRoot: '/carrier-root' };
    const value = { observed: 'product value' };
    const original = { detail: 'original product error' };
    let calls = 0;
    await expect(runTraceScope(recorder, scope, { name: 'session.run' }, () => {
      calls++;
      return value;
    })).resolves.toBe(value);
    await expect(runTraceScope(recorder, scope, { name: 'session.run' }, () => {
      calls++;
      throw original;
    })).rejects.toBe(original);
    expect(calls).toBe(2);
  });

  it.each(['getter', 'proxy'] as const)('preserves the child callback value and original error with a throwing carrier %s', async kind => {
    const recorder = carrierFailureRecorder(kind, 'provider.request');
    const scope = { sessionId: 'carrier-child', workspaceRoot: '/carrier-child' };
    const value = { observed: 'child product value' };
    const original = { detail: 'original child product error' };
    let calls = 0;
    await runTraceScope(recorder, scope, { name: 'session.run' }, async () => {
      await expect(traceOperation({ name: 'provider.request' }, () => {
        calls++;
        return value;
      })).resolves.toBe(value);
      await expect(traceOperation({ name: 'provider.request' }, () => {
        calls++;
        throw original;
      })).rejects.toBe(original);
    });
    expect(calls).toBe(2);
  });

  it('isolates concurrent scopes and long-lived structured loggers', async () => {
    const first = new InMemoryTraceStore();
    const second = new InMemoryTraceStore();
    const logger = createComponentLogger('existing');
    const logged: StructuredLogEntry[] = [];
    setStructuredLogSink(entry => logged.push(entry));
    let finishFirst!: () => void;
    const barrier = new Promise<void>(resolve => { finishFirst = resolve; });
    const oldRun = runTraceScope(first, { sessionId: 'A', workspaceRoot: '/A' }, { name: 'session.run' }, async () => {
      await barrier;
      await traceOperation({ name: 'tool.execute' }, () => {
        expect(currentTrace()?.scope.sessionId).toBe('A');
        logger.info('first');
      });
    });
    await runTraceScope(second, { sessionId: 'B', workspaceRoot: '/B' }, { name: 'session.run' }, async () => {
      await traceOperation({ name: 'provider.request' }, () => logger.info('second'));
    });
    finishFirst();
    await oldRun;
    const a = first.snapshot();
    const b = second.snapshot();
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(2);
    expect(a[0]!.traceId).not.toBe(b[0]!.traceId);
    expect(a.find(span => span.name === 'tool.execute')!.attributes).toMatchObject({ sessionId: 'A', workspaceRoot: '/A' });
    expect(logged.find(entry => entry.message === 'first')!.traceId).toBe(a[0]!.traceId);
    expect(logged.find(entry => entry.message === 'second')!.traceId).toBe(b[0]!.traceId);
  });

  it('retains session and workspace identity when caller span attributes reach the limit', async () => {
    const recorder = new InMemoryTraceStore();
    const attributes = Object.fromEntries(Array.from({ length: 32 }, (_, index) => [`caller.${index}`, index]));
    await runTraceScope(recorder, { sessionId: 'bounded-session', workspaceRoot: '/bounded/workspace' },
      { name: 'session.run', attributes }, () => {});
    const [span] = recorder.snapshot();
    expect(Object.keys(span!.attributes)).toHaveLength(32);
    expect(span!.attributes).toMatchObject({ sessionId: 'bounded-session', workspaceRoot: '/bounded/workspace' });
    expect(typeof span!.attributes.workspaceIdentity).toBe('string');
    expect(span!.attributes['caller.28']).toBe(28);
    expect(span!.attributes['caller.29']).toBeUndefined();
  });

  it('keeps missing propagation identity rather than borrowing a long-lived logger identity', async () => {
    const logger = createComponentLogger('existing', {
      traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), parentSpanId: 'c'.repeat(16),
    });
    const logged: StructuredLogEntry[] = [];
    setStructuredLogSink(entry => logged.push(entry));
    const unavailable: TelemetryContext = { startSpan: async () => { throw new Error('recorder unavailable'); } };
    await runTraceScope(unavailable, { sessionId: 'missing-A', workspaceRoot: '/missing-A' }, { name: 'session.run' },
      () => logger.info('missing-A'));
    await runTraceScope(carrierFailureRecorder('getter', 'session.run'),
      { sessionId: 'missing-B', workspaceRoot: '/missing-B' }, { name: 'session.run' },
      () => logger.info('missing-B'));
    expect(logged.map(entry => entry.message)).toEqual(['missing-A', 'missing-B']);
    for (const entry of logged) {
      expect(entry.traceId).toBeUndefined();
      expect(entry.spanId).toBeUndefined();
      expect(entry.parentSpanId).toBeUndefined();
    }
    logger.info('unbound');
    expect(logged.at(-1)).toMatchObject({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), parentSpanId: 'c'.repeat(16) });
  });

  it('preserves original thrown errors when persistence fails', async () => {
    const original = new Error('private arbitrary provider detail');
    const store = new InMemoryTraceStore({ onSpanSettled: () => { throw new Error('sink failed'); } });
    await expect(runTraceScope(store, { sessionId: 'A', workspaceRoot: '/A' }, { name: 'session.run' },
      () => traceOperation({ name: 'provider.request' }, () => { throw original; }))).rejects.toBe(original);
    const child = store.snapshot().find(span => span.name === 'provider.request')!;
    expect(child.status).toEqual({ status: 'error', error: { name: 'OperationError', message: 'Operation failed.' } });
  });

  it('runs once and preserves outcomes when a recorder refuses or fails after execution', async () => {
    let calls = 0;
    const refused: TelemetryContext = { startSpan: async () => { throw new Error('not available'); } };
    expect(await recordSpan(refused, { name: 'operation' }, () => ++calls)).toBe(1);
    const source = new InMemoryTraceStore();
    const lateFailure: TelemetryContext = { startSpan: async (options, callback) => {
      await source.startSpan(options, callback);
      throw new Error('late telemetry failure');
    } };
    expect(await recordSpan(lateFailure, { name: 'operation' }, () => ++calls)).toBe(2);
    expect(calls).toBe(2);
  });

  it('detaches snapshots and query results and bounds large records', async () => {
    const store = new InMemoryTraceStore();
    await store.startSpan({ name: 'detached', attributes: { original: ['keep'] } }, () => {});
    const snapshot = store.snapshot();
    (snapshot[0]!.attributes.original as string[])[0] = 'changed';
    const found = await store.findTraces();
    (found.traces[0]!.spans[0]!.attributes.original as string[])[0] = 'changed again';
    const trace = await store.getTrace(snapshot[0]!.traceId);
    (trace!.spans[0]!.attributes.original as string[])[0] = 'third change';
    expect(store.snapshot()[0]!.attributes.original).toEqual(['keep']);
    await store.startSpan({ name: 'bounded', attributes: { huge: ['\u0001'.repeat(10000)] } }, span => {
      for (let index = 0; index < 100; index++) span.addEvent('event', { array: Array(16).fill('\u0001'.repeat(256)) });
    });
    expect(Buffer.byteLength(JSON.stringify(store.snapshot()[1]))).toBeLessThanOrEqual(MAX_SPAN_BYTES);
  });

  it('caps persistent storage and ignores corrupt nested records', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-traces-'));
    temporary.push(directory);
    const filePath = path.join(directory, 'records.jsonl');
    const store = new JsonlTraceStore({ filePath, maxFileBytes: 2048 });
    for (let index = 0; index < 20; index++) await store.startSpan({ name: `span.${index}` }, () => {});
    expect(fs.statSync(filePath).size).toBeLessThanOrEqual(2048);
    const before = store.readAllSpans();
    fs.appendFileSync(filePath, `${JSON.stringify({ ...before[0], attributes: null, events: [{ name: 'bad' }] })}\n`);
    fs.appendFileSync(filePath, '{broken\n');
    expect(store.readAllSpans()).toHaveLength(before.length);
  });
});
