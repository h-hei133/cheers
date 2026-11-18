import { afterEach, expect, it, vi } from 'vitest';
import { runEventHandlers } from './dispatch.js';
import { dispatchExtensionEvent } from '../../core/hooks/extensionBridge.js';
import { registerCatalogContribution } from '../../core/catalog/contributions.js';

const root = '/tmp/cheers-test/navigation-events', sessionId = 'navigation';
const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).forEach(retire => retire()); vi.useRealTimers(); });
type Options = { readonly timeoutMs?: number; readonly signal?: AbortSignal; readonly admission?: () => string | undefined; readonly consume?: (result: unknown) => boolean };
const fire = (options: Options = {}) => dispatchExtensionEvent(root, sessionId, 'session_before_tree', { type: 'session_before_tree', targetEntryId: 'target' }, options);

it('retains the same before-event envelope for every handler and a cancellation cannot be erased', async () => {
  const payload = Object.freeze({ type: 'session_before_tree', targetEntryId: 'target' }); const seen: unknown[] = [];
  const handlers = new Map<string, Array<(payload: unknown) => unknown>>([['session_before_tree', [() => ({ cancel: false }), event => { seen.push(event); return { cancel: true }; }, () => ({ cancel: false })]]]);
  expect(await runEventHandlers({ handlers, event: 'session_before_tree', payload })).toEqual({ cancel: true });
  expect(seen).toEqual([payload]);
});

it('consumes a cancellation before running another contribution', async () => {
  cleanups.push(registerCatalogContribution({ root, sessionId, commands: [], tools: [], skills: () => [], onEvent: async () => ({ cancel: true }) }));
  const next = vi.fn(async () => undefined);
  cleanups.push(registerCatalogContribution({ root, sessionId, commands: [], tools: [], skills: () => [], onEvent: next }));
  let cancelled = false;
  const result = await fire({ consume: value => { cancelled = (value as { cancel?: boolean })?.cancel === true; return !cancelled; } });
  expect(cancelled).toBe(true); expect(result.cancelled).toBe(true); expect(next).not.toHaveBeenCalled();
});

it('does not accept a cancellation result after its caller signal is cancelled', async () => {
  let release!: (value: unknown) => void; let reached!: () => void;
  const ready = new Promise<void>(resolve => { reached = resolve; });
  cleanups.push(registerCatalogContribution({ root, sessionId, commands: [], tools: [], skills: () => [], onEvent: async () => {
    reached(); return new Promise(resolve => { release = resolve; }); } }));
  const controller = new AbortController(), consume = vi.fn(() => true);
  const pending = fire({ signal: controller.signal, consume }); await ready; controller.abort(); release({ cancel: false });
  expect((await pending).cancelled).toBe(true); expect(consume).not.toHaveBeenCalled();
});

it('rejects a before-event getter result without invoking the getter', async () => {
  const getter = vi.fn(() => true);
  const handlers = new Map([['session_before_tree', [() => Object.defineProperty({}, 'cancel', { enumerable: true, get: getter })]]]);
  await expect(runEventHandlers({ handlers, event: 'session_before_tree', payload: {} })).rejects.toThrow('result');
  expect(getter).not.toHaveBeenCalled();
});
