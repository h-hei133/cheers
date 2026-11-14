interface OutputPipe { pause(): unknown; resume(): unknown }
interface Delivery { readonly receive: () => void | Promise<void>; readonly failed: () => void }

/** The native pipes pause while output persists, including Node's forced exit flush. */
export class OutputConsumer {
  private pending: Promise<void> | undefined;
  private readonly queued = new Map<object, Delivery>();
  private failed = false;
  private incomplete = false;
  private readonly pipes = new Set<OutputPipe>();
  consume(pipes: readonly (OutputPipe | null)[], receive: () => void | Promise<void>, failed: () => void,
    source?: OutputPipe | null): void {
    if (this.failed) return;
    for (const pipe of pipes) if (pipe) this.pipes.add(pipe);
    if (this.pending) {
      // ChildProcess forcibly resumes both streams on native exit. Pause again
      // and admit only one late native chunk from each pipe, never a promise chain.
      this.pause();
      const key = source ?? pipes.find(pipe => pipe !== null) ?? receive;
      if (this.queued.has(key) || this.queued.size >= 2) { this.refuse(failed); return; }
      this.queued.set(key, { receive, failed });
      return;
    }
    this.run({ receive, failed });
  }
  private run(delivery: Delivery, draining = false): void {
    try {
      const pending = delivery.receive();
      if (!pending || typeof pending.then !== 'function') { if (draining) this.advance(); return; }
      this.pause();
      const settled = pending.catch(() => { this.refuse(delivery.failed); }).finally(() => {
        if (this.pending !== settled) return;
        this.pending = undefined;
        this.advance();
      });
      this.pending = settled;
    } catch { this.refuse(delivery.failed); }
  }
  private advance(): void {
    if (this.failed) return;
    const next = this.queued.entries().next().value as [object, Delivery] | undefined;
    if (next) { this.queued.delete(next[0]); this.run(next[1], true); }
    else for (const pipe of this.pipes) pipe.resume();
  }
  private pause(): void { for (const pipe of this.pipes) pipe.pause(); }
  private refuse(failed: () => void): void {
    this.failed = true;
    this.incomplete = true;
    this.queued.clear();
    failed();
  }
  interrupt(): boolean {
    this.failed = true;
    this.incomplete ||= !!this.pending || this.queued.size > 0;
    this.pending = undefined;
    this.queued.clear();
    for (const pipe of this.pipes) pipe.resume();
    return this.incomplete;
  }
  async drain(): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const drained = await Promise.race([(async () => {
        // A settling write admits the queued pipe deliveries synchronously;
        // recheck instead of treating the first promise snapshot as complete.
        while (this.pending) await this.pending;
        return true;
      })(),
        new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), 2000); })]);
      if (!drained) { this.incomplete = true; this.interrupt(); }
      return !this.incomplete;
    } finally { clearTimeout(timer); }
  }
}
