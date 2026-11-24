/** Bound a pending byte read without charging the consumer's processing time. */
export function withBodyIdleTimeout(
  source: ReadableStream<Uint8Array>,
  timeoutMs: number,
  signal?: AbortSignal,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finished = false;
  let lockReleased = false;
  let onAbort: (() => void) | undefined;

  const release = (cancel: boolean, reason?: unknown): void => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener('abort', onAbort);
    // Custom streams can leave their underlying cancellation promise pending.
    // The reader's pending reads settle as soon as cancellation is requested.
    const releaseLock = (): void => {
      if (lockReleased) return;
      lockReleased = true;
      try { reader.releaseLock(); } catch { /* A pending pull releases its reader in its own finally. */ }
    };
    if (cancel) void reader.cancel(reason).catch(() => undefined).finally(releaseLock);
    else releaseLock();
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      onAbort = () => {
        controller.error(signal?.reason);
        release(true);
      };
      if (signal?.aborted) onAbort();
      else signal?.addEventListener('abort', onAbort, { once: true });
    },
    async pull(controller) {
      timer = setTimeout(() => {
        const error = Object.assign(new Error('Provider response body timed out.'), { code: 'UND_ERR_BODY_TIMEOUT' });
        controller.error(error);
        release(true, error);
      }, timeoutMs);
      timer.unref();
      try {
        while (!finished) {
          const chunk = await reader.read();
          if (finished) return;
          if (chunk.done) {
            controller.close();
            release(false);
            return;
          }
          if (chunk.value.byteLength === 0) continue;
          controller.enqueue(chunk.value);
          return;
        }
      } catch (error) {
        if (finished) return;
        controller.error(error);
        release(true);
      } finally {
        clearTimeout(timer);
        if (finished) {
          if (lockReleased) return;
          lockReleased = true;
          try { reader.releaseLock(); } catch { /* Stream shutdown is best-effort. */ }
        }
      }
    },
    cancel(reason) { release(true, reason); },
  }, { highWaterMark: 0 });
}
