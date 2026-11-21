import { AsyncLocalStorage } from 'node:async_hooks';
import type { ExtensionUiHost } from './ui.js';

interface ExtensionInvocation {
  readonly ui: ExtensionUiHost | undefined;
  readonly signal: AbortSignal;
}

const invocations = new AsyncLocalStorage<ExtensionInvocation>();

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
): Promise<T> {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    return await invocations.run({ ui, signal: controller.signal }, operation);
  } finally {
    controller.abort();
    signal?.removeEventListener('abort', cancel);
  }
}
