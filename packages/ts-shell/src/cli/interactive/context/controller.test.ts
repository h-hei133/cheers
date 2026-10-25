import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createContextController, type ContextPreview } from './controller.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const preview = (tokens: number, verify = () => {}): ContextPreview => ({ estimate: { tokens, source: 'estimated', identity: { provider: 'p', model: 'm' }, method: 'characters/3.5' }, verify });

it('debounces drafts, serializes cancelled reads and discards late results', async () => {
  let key = 'a'; let finish!: (value: ContextPreview) => void;
  const signals: AbortSignal[] = [];
  const load = vi.fn((signal: AbortSignal) => { signals.push(signal); return new Promise<ContextPreview>(resolve => { finish = resolve; }); });
  const controller = createContextController({ identity: () => key, load, repaint: vi.fn() }); controller.start();
  await vi.advanceTimersByTimeAsync(150); expect(load).toHaveBeenCalledTimes(1);
  key = 'b'; controller.update(); expect(signals[0]!.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(1000); expect(load).toHaveBeenCalledTimes(1);
  finish(preview(100)); await vi.advanceTimersByTimeAsync(500); expect(controller.read()).toEqual({ source: 'unknown' });
  await vi.advanceTimersByTimeAsync(150); expect(load).toHaveBeenCalledTimes(2);
  finish(preview(200)); await vi.advanceTimersByTimeAsync(0); expect(controller.read()).toEqual({ tokens: 200, source: 'estimated' });
  controller.stop(); expect(controller.read()).toEqual({ source: 'stale' });
});

it('keeps frame reads pure and drops stale values after source checks', async () => {
  let changed = false; const verify = vi.fn(() => { if (changed) throw new Error('changed'); });
  const controller = createContextController({ identity: () => 'a', load: async () => preview(100, verify), repaint: vi.fn() }); controller.start();
  await vi.advanceTimersByTimeAsync(150); const calls = verify.mock.calls.length;
  for (let i = 0; i < 30; i++) expect(controller.read().tokens).toBe(100);
  expect(verify).toHaveBeenCalledTimes(calls);
  changed = true; await vi.advanceTimersByTimeAsync(2500);
  expect(controller.read()).toEqual({ source: 'stale' }); controller.stop();
});

it('handles synchronous failures and stopping during debounce without publication', async () => {
  const load = vi.fn(() => { throw new Error('unavailable'); });
  const controller = createContextController({ identity: () => 'a', load, repaint: vi.fn() }); controller.start();
  await vi.advanceTimersByTimeAsync(150); expect(controller.read()).toEqual({ source: 'unknown' });
  await vi.advanceTimersByTimeAsync(1000); expect(load).toHaveBeenCalledTimes(1); controller.stop();
  const stopped = createContextController({ identity: () => 'a', load, repaint: vi.fn() }); stopped.start(); stopped.stop();
  await vi.advanceTimersByTimeAsync(150); expect(load).toHaveBeenCalledTimes(1);
});
