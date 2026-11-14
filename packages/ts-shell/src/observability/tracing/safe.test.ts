import { expect, it } from 'vitest';
import { recordSpan } from './safe.js';
import { InMemoryTraceStore } from './span.js';
import type { SpanOptions, TelemetryContext, TelemetrySpan } from './types.js';

function brokenSpan(): TelemetrySpan {
  const source = new InMemoryTraceStore();
  return { get propagation(): never { throw new Error('getter failed'); },
    startSpan: (options, callback) => source.startSpan(options, callback),
    addLink: () => {}, addEvent: () => {}, setAttributes: () => {}, setStatus: () => {} };
}

it('returns the exact product value/error when the recorder hangs after invocation', async () => {
  const span = brokenSpan();
  const hanging: TelemetryContext = { startSpan: async (_options, callback) => {
    await callback(span);
    return new Promise<never>(() => {});
  } };
  const value = { observed: true };
  expect(await recordSpan(hanging, { name: 'operation' }, () => value)).toBe(value);
  const original = { private: 'original thrown object' };
  await expect(recordSpan(hanging, { name: 'operation' }, () => { throw original; })).rejects.toBe(original);
});

it('runs once when admission never arrives and labels a late recorder as unavailable', async () => {
  const source = new InMemoryTraceStore();
  let admit!: () => Promise<void>;
  const delayed: TelemetryContext = { startSpan: <T>(options: SpanOptions, callback: (span: TelemetrySpan) => T | Promise<T>) => {
    const pending = new Promise<T>((resolve, reject) => {
      admit = async () => {
        try { resolve(await source.startSpan(options, callback)); }
        catch (error) { reject(error); }
      };
    });
    return pending;
  } };
  let calls = 0;
  expect(await recordSpan(delayed, { name: 'operation' }, () => ++calls)).toBe(1);
  await admit();
  expect(calls).toBe(1);
  expect(source.snapshot()[0]!.attributes).toMatchObject({ 'telemetry.coverage': 'unavailable', 'telemetry.late': true });
  expect(source.snapshot()[0]!.status.status).toBe('error');
});

it('does not repeat a callback when the recorder invokes it twice', async () => {
  const span = brokenSpan();
  const duplicate: TelemetryContext = { startSpan: async (_options, callback) => {
    const first = callback(span);
    await callback(span);
    return await first;
  } };
  let calls = 0;
  expect(await recordSpan(duplicate, { name: 'operation' }, () => ++calls)).toBe(1);
  expect(calls).toBe(1);
});

it('keeps normal in-memory settlement and persistence before immediate query', async () => {
  const order: string[] = [];
  const store = new InMemoryTraceStore({ onSpanSettled: () => { order.push('persisted'); } });
  await recordSpan(store, { name: 'normal' }, async () => {
    await Promise.resolve();
    order.push('product');
    return 'value';
  });
  order.push('returned');
  expect(order).toEqual(['product', 'persisted', 'returned']);
  expect((await store.findTraces()).traces).toHaveLength(1);
  expect((await store.getTrace(store.snapshot()[0]!.traceId))?.spans).toHaveLength(1);
});
