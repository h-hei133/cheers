/** Track queued and dispatched content requests so cancellation also prevents late dispatch. */
export class McpContentLifetime {
  private readonly pending = new Set<AbortController>();

  begin(parent?: AbortSignal): { signal: AbortSignal; dispose(): void } {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    this.pending.add(controller);
    if (parent?.aborted) cancel();
    else parent?.addEventListener("abort", cancel, { once: true });
    return { signal: controller.signal, dispose: () => {
      parent?.removeEventListener("abort", cancel);
      this.pending.delete(controller);
    } };
  }

  cancel(): void {
    for (const controller of this.pending) controller.abort();
  }
}
