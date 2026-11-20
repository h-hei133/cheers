import type { DesktopEvidence } from '@cheers/desktop';
import { DesktopAdmissionError } from './domain.js';

/** One desktop action deadline covers all native queries and input. */
export class DesktopScope {
  private readonly controller = new AbortController();
  readonly signal = this.controller.signal;
  readonly stopped: Promise<void>;
  readonly evidence: DesktopEvidence = { state: 'completed', effect: 'none', cleanup: 'complete' };
  private readonly deadline = Date.now() + 30_000;
  private readonly timer = setTimeout(() => this.cancel(), 30_000);

  constructor(private readonly parent?: AbortSignal) {
    this.stopped = new Promise(resolve => { this.signal.addEventListener('abort', () => resolve(), { once: true }); });
    parent?.addEventListener('abort', this.cancel, { once: true });
    if (parent?.aborted) this.cancel();
  }

  readonly cancel = (): void => this.controller.abort();

  check(): void {
    if (Date.now() >= this.deadline) this.cancel();
    if (this.signal.aborted) {
      this.evidence.state = 'cancelled';
      throw new DesktopAdmissionError('cancelled', 'Desktop action cancelled; external effects are not rolled back.');
    }
  }

  remaining(): number { this.check(); return Math.max(1, this.deadline - Date.now()); }
  dispose(): void { clearTimeout(this.timer); this.parent?.removeEventListener('abort', this.cancel); }
}
