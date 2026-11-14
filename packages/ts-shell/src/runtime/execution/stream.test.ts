import { afterEach, expect, it, vi } from 'vitest';
import { OutputConsumer } from './stream.js';

afterEach(() => { vi.useRealTimers(); });

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function pipe() { return { pause: vi.fn(), resume: vi.fn() }; }

it('admits one forced exit-flush delivery per pipe and drains them before settlement', async () => {
  const consumer = new OutputConsumer();
  const stdout = pipe(); const stderr = pipe();
  const first = deferred(); const second = deferred();
  const order: string[] = [];
  const failed = vi.fn();
  consumer.consume([stdout, stderr], () => { order.push('active'); return first.promise; }, failed, stdout);
  // Node's child exit forces resume while the consumer still owns its pause.
  stdout.resume(); stderr.resume();
  consumer.consume([stdout, stderr], () => { order.push('late-stdout'); return second.promise; }, failed, stdout);
  consumer.consume([stdout, stderr], () => { order.push('late-stderr'); }, failed, stderr);
  expect(order).toEqual(['active']);
  expect(stdout.pause).toHaveBeenCalledTimes(3);
  let drained = false;
  const finishing = consumer.drain().then(value => { drained = true; return value; });
  first.resolve();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(order).toEqual(['active', 'late-stdout']);
  expect(drained).toBe(false);
  second.resolve();
  expect(await finishing).toBe(true);
  expect(order).toEqual(['active', 'late-stdout', 'late-stderr']);
  expect(failed).not.toHaveBeenCalled();
});

it('refuses a second queued delivery on the same pipe and drops it on interruption', async () => {
  const consumer = new OutputConsumer(); const stdout = pipe(); const stderr = pipe();
  const active = deferred(); const queued = vi.fn();
  const failed = vi.fn(() => { consumer.interrupt(); });
  consumer.consume([stdout, stderr], () => active.promise, failed, stdout);
  consumer.consume([stdout, stderr], queued, failed, stdout);
  consumer.consume([stdout, stderr], queued, failed, stdout);
  expect(failed).toHaveBeenCalledTimes(1);
  active.resolve();
  expect(await consumer.drain()).toBe(false);
  expect(queued).not.toHaveBeenCalled();
});

it('bounds drain time and retires queued deliveries when persistence stalls', async () => {
  vi.useFakeTimers();
  const consumer = new OutputConsumer(); const stdout = pipe(); const stderr = pipe();
  const active = deferred(); const queued = vi.fn();
  consumer.consume([stdout, stderr], () => active.promise, vi.fn(), stdout);
  consumer.consume([stdout, stderr], queued, vi.fn(), stderr);
  const finishing = consumer.drain();
  await vi.advanceTimersByTimeAsync(2_000);
  expect(await finishing).toBe(false);
  active.resolve();
  await Promise.resolve(); await Promise.resolve();
  expect(queued).not.toHaveBeenCalled();
});
