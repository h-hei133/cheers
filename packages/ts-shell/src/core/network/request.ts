import { NetworkError } from './error.js';

export interface RequestScope {
  readonly signal: AbortSignal;
  check(): void;
  dispose(): void;
}

/** One deadline spans headers, redirects, body consumption and parsing. */
export function requestScope(timeoutMs: number, parent?: AbortSignal): RequestScope {
  const controller = new AbortController();
  const deadline = performance.now() + timeoutMs;
  const cancel = (): void => controller.abort(new NetworkError('cancelled'));
  const timeout = (): void => controller.abort(new NetworkError('timeout'));
  parent?.addEventListener('abort', cancel, { once: true });
  if (parent?.aborted) cancel();
  const timer = setTimeout(timeout, timeoutMs);
  return {
    signal: controller.signal,
    check() {
      if (!controller.signal.aborted && performance.now() >= deadline) timeout();
      controller.signal.throwIfAborted();
    },
    dispose() {
      clearTimeout(timer);
      parent?.removeEventListener('abort', cancel);
    },
  };
}
