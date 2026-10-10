/** The native pipe pauses while its consumer persists output, keeping queued writes bounded. */
export class OutputConsumer {
  private readonly pending = new Set<Promise<void>>();
  private failed = false;
  private incomplete = false;
  private readonly pipes = new Set<{ pause(): unknown; resume(): unknown }>();
  consume(pipes: readonly ({ pause(): unknown; resume(): unknown } | null)[],
    receive: () => void | Promise<void>, failed: () => void): void {
    if (this.failed) return;
    const refuse = () => { this.failed = true; this.incomplete = true; failed(); };
    try {
      const pending = receive(); if (!pending || typeof pending.then !== 'function') return;
      for (const pipe of pipes) if (pipe) { this.pipes.add(pipe); pipe.pause(); }
      const settled = pending.catch(refuse).finally(() => {
        this.pending.delete(settled);
        if (!this.pending.size) for (const pipe of pipes) pipe?.resume();
      });
      this.pending.add(settled);
    } catch { refuse(); }
  }
  interrupt(): boolean {
    this.failed = true; this.incomplete ||= this.pending.size > 0; this.pending.clear();
    for (const pipe of this.pipes) pipe.resume();
    return this.incomplete;
  }
  async drain(): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const drained = await Promise.race([Promise.allSettled([...this.pending]).then(() => true),
        new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), 2000); })]);
      if (!drained) { this.incomplete = true; this.interrupt(); }
      return !this.incomplete;
    } finally { clearTimeout(timer); }
  }
}
