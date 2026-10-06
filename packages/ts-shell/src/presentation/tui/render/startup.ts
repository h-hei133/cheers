import type { TuiStartOptions } from './frame.js';

/** One renderer start owns its first-frame observations, including delayed writes. */
export class FrameStartup {
  private active = true;
  private layout?: () => void;
  private written?: () => void;

  constructor(options: Pick<TuiStartOptions, 'onFirstLayout' | 'onFirstWrite'>) {
    this.layout = options.onFirstLayout;
    this.written = options.onFirstWrite;
  }

  /** Called only after a valid layout; the returned observer belongs to that write. */
  beginFrame(): (() => void) | undefined {
    if (!this.active) return undefined;
    const layout = this.layout; this.layout = undefined; layout?.();
    const written = this.written; this.written = undefined;
    return written ? () => { if (this.active) written(); } : undefined;
  }

  cancel(): void {
    this.active = false;
  }
}
