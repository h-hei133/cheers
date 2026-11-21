/** Serialize gateway work and keep queued cancellation separate from dispatched cancellation. */
export class McpOperationQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private readonly pending = new Set<() => void>();
  private stopped = false;

  get closed(): boolean { return this.stopped; }

  run<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (this.stopped) return Promise.reject(new Error('MCP gateway is closed'));
    if (signal?.aborted) return Promise.reject(signal.reason);
    return new Promise<T>((resolve, reject) => {
      const abort = (): void => {
        finish();
        reject(signal?.aborted ? signal.reason : new Error('MCP gateway is closed'));
      };
      const finish = (): void => {
        this.pending.delete(abort);
        signal?.removeEventListener('abort', abort);
      };
      this.pending.add(abort);
      const queued = this.tail.then(() => {
        finish();
        if (this.stopped) throw new Error('MCP gateway is closed');
        signal?.throwIfAborted();
        return operation();
      });
      this.tail = queued.catch(() => {});
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      queued.then(
        value => { finish(); resolve(value); },
        error => { finish(); reject(error); },
      );
    });
  }

  close(): Promise<unknown> {
    this.stopped = true;
    for (const cancel of this.pending) cancel();
    return this.tail;
  }
}
