import { afterEach, expect, it, vi } from 'vitest';
import * as bridge from './extensionBridge.js';
import { catalogContributions, registerCatalogContribution } from '../catalog/contributions.js';

const root = '/tmp/cheers-test/extension-events';
const cleanups: Array<() => void> = [];
type Dispatch = (root: string, sessionId: string, event: string, payload: unknown,
  options?: { readonly signal?: AbortSignal; readonly admission?: () => string | undefined; readonly timeoutMs?: number })
  => Promise<{ readonly delivered: number; readonly failed: number; readonly cancelled: boolean }>;
const dispatch: Dispatch = (...args) => {
  const invoke = (bridge as unknown as { dispatchExtensionEvent?: Dispatch }).dispatchExtensionEvent;
  expect(invoke).toBeTypeOf('function');
  return invoke!(...args);
};
function contribution(onEvent: NonNullable<Parameters<typeof registerCatalogContribution>[0]['onEvent']>,
  sessionId = 'selected', workspace = root, signal?: AbortSignal) {
  const retire = registerCatalogContribution({ root: workspace, sessionId, commands: [], tools: [], skills: () => [], onEvent, signal });
  cleanups.push(retire);
  return retire;
}
afterEach(() => {
  cleanups.splice(0).reverse().forEach(retire => retire());
  bridge.registerExtensionEventProvider((root, sessionId) => catalogContributions(root, sessionId).flatMap(entry => entry.onEvent ? [entry.onEvent] : []));
  vi.useRealTimers(); vi.restoreAllMocks();
});

it('dispatches notifications only to the exact workspace and session', async () => {
  const selected = vi.fn(async () => undefined);
  const sibling = vi.fn(async () => undefined);
  const foreign = vi.fn(async () => undefined);
  contribution(selected); contribution(sibling, 'sibling'); contribution(foreign, 'selected', root + '-foreign');
  const event = { type: 'agent_start' };
  expect(await dispatch(root, 'selected', 'agent_start', event)).toEqual({ delivered: 1, failed: 0, cancelled: false });
  expect(selected).toHaveBeenCalledWith('agent_start', event, undefined, expect.any(AbortSignal));
  expect(sibling).not.toHaveBeenCalled(); expect(foreign).not.toHaveBeenCalled();
});

it('refuses a retained event runner after its contribution is retired', async () => {
  const handler = vi.fn(async () => ({ decision: 'allow' }));
  const retire = contribution(handler);
  const runner = bridge.getExtensionEventRunners(root, 'selected')[0]!;
  retire();
  await expect(runner('agent_end', { type: 'agent_end', messages: [] })).rejects.toThrow('retired');
  expect(handler).not.toHaveBeenCalled();
});

it('rejects the late result of an event that loses its registration while pending', async () => {
  let finish!: (value: unknown) => void;
  const handler = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  const retire = contribution(handler);
  const runner = bridge.getExtensionEventRunners(root, 'selected')[0]!;
  const observed = runner('agent_end', { type: 'agent_end', messages: [] }).then(value => ({ value }), error => ({ error }));
  await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce());
  retire(); finish({ decision: 'allow' });
  expect(await observed).toHaveProperty('error');
});

it('rejects a cancelled event result while preserving ordinary hook decisions', async () => {
  let finish!: (value: unknown) => void;
  const handler = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  contribution(handler);
  const runner = bridge.getExtensionEventRunners(root, 'selected')[0]!;
  const controller = new AbortController();
  const observed = runner('PreToolUse', {}, ['tool_call'], controller.signal).then(value => ({ value }), error => ({ error }));
  await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce());
  controller.abort(); finish({ decision: 'allow' });
  expect(await observed).toHaveProperty('error');
  const allowed = { decision: 'block', reason: 'Explicit native hook veto.' };
  contribution(async () => allowed, 'ordinary');
  expect(await bridge.getExtensionEventRunners(root, 'ordinary')[0]!('PreToolUse', {})).toBe(allowed);
});

it('isolates a failed observer without accepting its return value as a permission decision', async () => {
  contribution(async () => { throw new Error('SYNTHETIC_UNSAFE_OBSERVER_DETAIL'); });
  const next = vi.fn(async () => ({ decision: 'block' })); contribution(next);
  const result = await dispatch(root, 'selected', 'message_end', { type: 'message_end', message: { role: 'assistant', content: 'Done' } });
  expect(result).toEqual({ delivered: 1, failed: 1, cancelled: false });
  expect(next).toHaveBeenCalledOnce(); expect(JSON.stringify(result)).not.toContain('SYNTHETIC_UNSAFE_OBSERVER_DETAIL');
});

it('captures each notification audience once and skips retired runners without invoking a successor', async () => {
  const retired = vi.fn(async () => undefined); const successor = vi.fn(async () => undefined);
  let first = true; let retireSecond!: () => void;
  const retireFirst = contribution(async () => {
    if (first) { first = false; retireSecond(); contribution(successor); }
  });
  retireSecond = contribution(retired);
  await dispatch(root, 'selected', 'turn_end', { type: 'turn_end' });
  expect(retired).not.toHaveBeenCalled(); expect(successor).not.toHaveBeenCalled();
  retireFirst();
  expect(await dispatch(root, 'selected', 'agent_end', { type: 'agent_end', messages: [] })).toEqual({ delivered: 1, failed: 0, cancelled: false });
  expect(successor).toHaveBeenCalledOnce();
});

it('cancels a pending notification and never invokes its remaining audience', async () => {
  let finish!: (value: unknown) => void;
  let callbackSignal!: AbortSignal;
  const handler = vi.fn((_event, _payload, _aliases, signal) => {
    callbackSignal = signal!; return new Promise(resolve => { finish = resolve; });
  });
  const next = vi.fn(async () => undefined); contribution(handler); contribution(next);
  const controller = new AbortController();
  const pending = dispatch(root, 'selected', 'message_update', { type: 'message_update' }, { signal: controller.signal });
  await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce()); controller.abort();
  const result = await pending;
  expect(result.cancelled).toBe(true); expect(callbackSignal.aborted).toBe(true); expect(next).not.toHaveBeenCalled();
  finish({ decision: 'allow' }); await Promise.resolve();
});

it('stops the remaining audience if its source admission retires after an observer', async () => {
  let current = true;
  contribution(async () => { current = false; });
  const next = vi.fn(async () => undefined); contribution(next);
  const result = await dispatch(root, 'selected', 'turn_start', { type: 'turn_start' }, { admission: () => current ? undefined : 'Source retired.' });
  expect(result.cancelled).toBe(true); expect(next).not.toHaveBeenCalled();
});

it('bounds a non-cooperative observer and observes its eventual rejection', async () => {
  vi.useFakeTimers();
  let reject!: (reason: unknown) => void; let callbackSignal!: AbortSignal;
  const handler = vi.fn((_event, _payload, _aliases, signal) => {
    callbackSignal = signal!; return new Promise((_resolve, refused) => { reject = refused; });
  });
  contribution(handler); const next = vi.fn(async () => undefined); contribution(next);
  const pending = dispatch(root, 'selected', 'agent_settled', { type: 'agent_settled', aborted: false }, { timeoutMs: 20 });
  await vi.advanceTimersByTimeAsync(20);
  expect((await pending).cancelled).toBe(true); expect(callbackSignal.aborted).toBe(true); expect(next).not.toHaveBeenCalled();
  reject(new Error('SYNTHETIC_LATE_REJECTION')); await vi.advanceTimersByTimeAsync(0);
});

it('admits terminal notifications under their own signal after kernel cancellation', async () => {
  const run = new AbortController(); run.abort();
  const observer = vi.fn(async (_event, _payload, _aliases, signal) => { expect(signal!.aborted).toBe(false); });
  contribution(observer);
  expect(await dispatch(root, 'selected', 'agent_settled', { type: 'agent_settled', aborted: run.signal.aborted }))
    .toEqual({ delivered: 1, failed: 0, cancelled: false });
  expect(observer).toHaveBeenCalledOnce();
});

it('rejects an already aborted contribution and does not dispatch an already cancelled notification', async () => {
  const controller = new AbortController(); controller.abort();
  expect(() => contribution(async () => undefined, 'retired', root, controller.signal)).toThrow();
  const observer = vi.fn(async () => undefined); contribution(observer);
  expect((await dispatch(root, 'selected', 'agent_start', { type: 'agent_start' }, { signal: controller.signal })).cancelled).toBe(true);
  expect(observer).not.toHaveBeenCalled();
});

it('keeps native cancellation authoritative when an observer shadows the signal fields', async () => {
  let finish!: () => void;
  const controller = new AbortController();
  contribution(async (_event, _payload, _aliases, signal) => {
    Object.defineProperty(signal!, 'aborted', { value: false });
    Object.defineProperty(signal!, 'throwIfAborted', { value: () => undefined });
    await new Promise<void>(resolve => { finish = resolve; });
  });
  const pending = dispatch(root, 'selected', 'message_update', {}, { signal: controller.signal });
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  controller.abort();
  expect((await pending).cancelled).toBe(true);
  finish(); await Promise.resolve();
});

it('retains the dispatch deadline when a direct runner shadows its signal methods', async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  const next = vi.fn(async () => undefined);
  bridge.registerExtensionEventProvider(() => [async (_event, _payload, _aliases, signal) => {
    Object.defineProperty(signal!, 'aborted', { value: false });
    Object.defineProperty(signal!, 'throwIfAborted', { value: () => undefined });
    await new Promise<void>(resolve => { finish = resolve; });
  }, next]);
  const pending = dispatch(root, 'selected', 'agent_settled', {}, { timeoutMs: 20 });
  await vi.advanceTimersByTimeAsync(20);
  expect((await pending).cancelled).toBe(true);
  expect(next).not.toHaveBeenCalled(); finish(); await vi.advanceTimersByTimeAsync(0);
});
