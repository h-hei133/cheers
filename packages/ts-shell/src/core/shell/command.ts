/** Local commands share the host's cancellation and settlement boundary. */
export class ShellCommandRuntime {
  private active: { readonly kind: 'command' | 'compaction'; readonly controller: AbortController; settled: Promise<unknown> } | undefined;

  get current(): { readonly kind: 'command' | 'compaction'; readonly controller: AbortController; readonly settled: Promise<unknown> } | undefined {
    return this.active;
  }

  run<T>(operation: (signal: AbortSignal) => Promise<T>, kind: 'command' | 'compaction' = 'command', signal?: AbortSignal): Promise<T> {
    if (this.active) return Promise.reject(new Error('A local command is still running.'));
    const entry = { kind, controller: new AbortController(), settled: Promise.resolve() as Promise<unknown> };
    // Register before entering command code, including synchronous cancellation.
    this.active = entry;
    const abort = () => entry.controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const settled = Promise.resolve().then(() => operation(entry.controller.signal)).finally(() => {
      signal?.removeEventListener('abort', abort);
      if (this.active === entry) this.active = undefined;
    });
    entry.settled = settled;
    // The caller and the host's idle barrier retain the original rejection.
    settled.catch(() => {});
    return settled;
  }
}
