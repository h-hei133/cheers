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

it('serializes periodic byte checks and keeps frame reads free of verification', async () => {
  let finish!: () => void;
  const value = { ...preview(100), verifyContent: vi.fn(async () => {}) };
  const load = vi.fn(async () => value);
  const controller = createContextController({ identity: () => 'a', load, repaint: vi.fn() }); controller.start();
  await vi.advanceTimersByTimeAsync(150); expect(value.verifyContent).toHaveBeenCalledTimes(1);
  value.verifyContent.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  await vi.advanceTimersByTimeAsync(2500); expect(value.verifyContent).toHaveBeenCalledTimes(2);
  for (let i = 0; i < 30; i++) expect(controller.read()).toEqual({ tokens: 100, source: 'estimated' });
  await vi.advanceTimersByTimeAsync(3000); expect(value.verifyContent).toHaveBeenCalledTimes(2); expect(load).toHaveBeenCalledTimes(1);
  finish(); await vi.advanceTimersByTimeAsync(0); expect(controller.read().tokens).toBe(100); controller.stop();
});

it('waits for a cancelled content check to settle before loading a new identity', async () => {
  let key = 'a'; let finish!: () => void; const signals: AbortSignal[] = [];
  const value = { ...preview(100), verifyContent: vi.fn(async (signal: AbortSignal) => { signals.push(signal); }) };
  const load = vi.fn(async () => value);
  const controller = createContextController({ identity: () => key, load, repaint: vi.fn() }); controller.start();
  await vi.advanceTimersByTimeAsync(150);
  value.verifyContent.mockImplementation(signal => { signals.push(signal); return new Promise<void>(resolve => { finish = resolve; }); });
  await vi.advanceTimersByTimeAsync(2500); key = 'b'; controller.update(); expect(signals[1]!.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(2000); expect(load).toHaveBeenCalledTimes(1); expect(controller.read()).toEqual({ source: 'stale' });
  value.verifyContent.mockResolvedValue(undefined); finish(); await vi.advanceTimersByTimeAsync(650);
  expect(load).toHaveBeenCalledTimes(2); expect(controller.read().tokens).toBe(100); controller.stop();
});

it('does not extend preview expiry through successful periodic byte checks', async () => {
  const value = { ...preview(100), verifyContent: vi.fn(async () => {}) };
  const load = vi.fn(async () => value);
  const controller = createContextController({ identity: () => 'a', load, repaint: vi.fn() }); controller.start();
  await vi.advanceTimersByTimeAsync(150); await vi.advanceTimersByTimeAsync(20000);
  expect(value.verifyContent.mock.calls.length).toBeGreaterThan(2); expect(load).toHaveBeenCalledTimes(1);
  expect(controller.read()).toEqual({ source: 'stale' });
  await vi.advanceTimersByTimeAsync(5500); expect(load).toHaveBeenCalledTimes(2); controller.stop();
});

it('expires and aborts a pending check without publishing its late success', async () => {
  let finish!: () => void; let checkingSignal!: AbortSignal;
  const value = { ...preview(100), verifyContent: vi.fn(async (_signal: AbortSignal) => {}) };
  const controller = createContextController({ identity: () => 'a', load: async () => value, repaint: vi.fn() }); controller.start();
  await vi.advanceTimersByTimeAsync(15150);
  value.verifyContent.mockImplementation(signal => { checkingSignal = signal; return new Promise<void>(resolve => { finish = resolve; }); });
  await vi.advanceTimersByTimeAsync(2500); expect(checkingSignal.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(3000); expect(checkingSignal.aborted).toBe(true); expect(controller.read()).toEqual({ source: 'stale' });
  finish(); await vi.advanceTimersByTimeAsync(0); expect(controller.read()).toEqual({ source: 'stale' }); controller.stop();
});

it('marks timed-out content checks stale and retains the pending slot until settlement', async () => {
  let finish!: () => void; let signal!: AbortSignal;
  const value = { ...preview(100), verifyContent: vi.fn(async (_signal: AbortSignal) => {}) };
  const load = vi.fn(async () => value);
  const controller = createContextController({ identity: () => 'a', load, repaint: vi.fn() }); controller.start();
  await vi.advanceTimersByTimeAsync(150);
  value.verifyContent.mockImplementation(checking => { signal = checking; return new Promise<void>(resolve => { finish = resolve; }); });
  await vi.advanceTimersByTimeAsync(13000); expect(signal.aborted).toBe(true); expect(controller.read()).toEqual({ source: 'stale' });
  await vi.advanceTimersByTimeAsync(7000); expect(load).toHaveBeenCalledTimes(1);
  value.verifyContent.mockResolvedValue(undefined); finish(); await vi.advanceTimersByTimeAsync(650);
  expect(load).toHaveBeenCalledTimes(2); controller.stop();
});

it('withdraws a published estimate when its periodic content check fails', async () => {
  const value = { ...preview(200), verifyContent: vi.fn(async () => {}) }; const load = vi.fn(async () => value);
  const controller = createContextController({ identity: () => 'a', load, repaint: vi.fn() }); controller.start();
  await vi.advanceTimersByTimeAsync(150); expect(controller.read().tokens).toBe(200);
  value.verifyContent.mockRejectedValue(new Error('Source changed.')); await vi.advanceTimersByTimeAsync(2500);
  expect(controller.read()).toEqual({ source: 'stale' }); expect(load).toHaveBeenCalledTimes(1); controller.stop();
});
