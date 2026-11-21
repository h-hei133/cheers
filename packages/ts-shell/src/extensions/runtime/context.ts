import { AsyncLocalStorage } from 'node:async_hooks';
import type { ExtensionUiHost } from './ui.js';

interface ExtensionInvocation {
  readonly ui: ExtensionUiHost | undefined;
  readonly signal: AbortSignal;
  readonly reloadStartup?: AbortSignal;
}

const invocations = new AsyncLocalStorage<ExtensionInvocation>();
const reloadEvents = new WeakMap<object, AbortSignal>();

export async function dispatchReloadStartup(event: object, signal: AbortSignal, dispatch: () => Promise<void>): Promise<void> {
  reloadEvents.set(event, signal);
  try { await dispatch(); }
  finally { reloadEvents.delete(event); }
}

export function reloadStartupSignal(event: string, payload: unknown): AbortSignal | undefined {
  return event === 'session_start' && typeof payload === 'object' && payload !== null ? reloadEvents.get(payload) : undefined;
}

export function currentExtensionInvocation(): ExtensionInvocation | undefined {
  return invocations.getStore();
}

export function renderExtensionMessage<T>(operation: () => T): T {
  return invocations.run({ ui: undefined, signal: AbortSignal.abort() }, operation);
}

/** Async callbacks retain the UI and cancellation owner that admitted the call. */
export async function runExtensionInvocation<T>(
  ui: ExtensionUiHost | undefined,
  signal: AbortSignal | undefined,
  operation: () => T | Promise<T>,
  reloadStartup?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    return await invocations.run({ ui, signal: controller.signal, reloadStartup }, operation);
  } finally {
    controller.abort();
    signal?.removeEventListener('abort', cancel);
  }
}
