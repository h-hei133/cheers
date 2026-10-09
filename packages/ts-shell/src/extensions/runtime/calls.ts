/** Shared cancellation ownership for discovery, ordinary approvals and native dispatch. */
export class ExtensionCalls {
  private readonly pending = new Map<AbortController, Promise<unknown>>();
  run<T>(action: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const controller = new AbortController(); const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true }); if (signal?.aborted) cancel();
    const task = Promise.resolve().then(() => { controller.signal.throwIfAborted(); return action(controller.signal); })
      .finally(() => { this.pending.delete(controller); signal?.removeEventListener('abort', cancel); });
    this.pending.set(controller, task); return task;
  }
  async cancel(except?: AbortSignal): Promise<boolean> {
    const pending = [...this.pending].filter(([controller]) => controller.signal !== except);
    for (const [controller] of pending) controller.abort();
    if (!pending.length) return true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([Promise.allSettled(pending.map(([, task]) => task)).then(() => true), new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 3000); })]); }
    finally { clearTimeout(timer); }
  }
}
