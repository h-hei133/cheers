/** One deadline and cancellation signal for the entire native browser login. */
export function loginLifetime(timeoutMs: number, parent?: AbortSignal) {
  const controller = new AbortController();
  const cancel = () => controller.abort(new DOMException('Sign-in cancelled.', 'AbortError'));
  parent?.addEventListener('abort', cancel, { once: true });
  if (parent?.aborted) cancel();
  const timer = setTimeout(() => controller.abort(new DOMException('Sign-in timed out.', 'TimeoutError')), timeoutMs);
  return { signal: controller.signal, close() { clearTimeout(timer); parent?.removeEventListener('abort', cancel); } };
}

/** Observe late settlement without allowing it to resume a cancelled login. */
export function waitForLogin<T>(pending: PromiseLike<T> | T, signal?: AbortSignal): Promise<T> {
  if (!signal) return Promise.resolve(pending);
  return new Promise<T>((resolve, reject) => {
    const cancel = () => { signal.removeEventListener('abort', cancel); reject(signal.reason); };
    signal.addEventListener('abort', cancel, { once: true });
    Promise.resolve(pending).then(value => {
      signal.removeEventListener('abort', cancel);
      if (signal.aborted) reject(signal.reason);
      else resolve(value);
    }, error => { signal.removeEventListener('abort', cancel); reject(error); });
    if (signal.aborted) cancel();
  });
}
