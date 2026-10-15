/** Local commands share the host's cancellation and settlement boundary. */
export class ShellCommandRuntime {
  private active: { readonly controller: AbortController; settled: Promise<unknown> } | undefined;

  get current(): { readonly controller: AbortController; readonly settled: Promise<unknown> } | undefined {
    return this.active;
  }

  run<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.active) return Promise.reject(new Error('A local command is still running.'));
    const entry = { controller: new AbortController(), settled: Promise.resolve() as Promise<unknown> };
    // Register before entering command code, including synchronous cancellation.
    this.active = entry;
    const settled = Promise.resolve().then(() => operation(entry.controller.signal)).finally(() => {
      if (this.active === entry) this.active = undefined;
    });
    entry.settled = settled;
    // The caller and the host's idle barrier retain the original rejection.
    settled.catch(() => {});
    return settled;
  }
}
