import { NetworkError } from './error.js';

export interface RequestScope {
  readonly signal: AbortSignal;
  check(): void;
  dispose(): void;
}

/** Stop waiting for non-cancellable operations without dispatching their late result. */
export async function withinRequest<T>(operation: Promise<T>, scope: RequestScope): Promise<T> {
  let abort: () => void;
  return new Promise<T>((resolve, reject) => {
    abort = (): void => reject(scope.signal.reason);
    scope.signal.addEventListener('abort', abort, { once: true });
    operation.then(resolve, reject);
    if (scope.signal.aborted) abort();
  }).finally(() => { scope.signal.removeEventListener('abort', abort); scope.check(); });
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
