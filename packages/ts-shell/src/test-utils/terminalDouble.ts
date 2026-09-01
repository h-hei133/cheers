import type {
  RenderScheduler,
} from "../presentation/tui/render/frame.js";
import type { TerminalDevice, TerminalStartOptions } from "../presentation/tui/terminal.js";

/**
 * Terminal and scheduler doubles for renderer tests.
 *
 * A frame is bytes written to a device at a size, on a clock. Recording those
 * three lets a test assert what would actually appear on screen without a tty,
 * and drive resize, input, and frame timing deterministically.
 */

/** Records every byte the engine writes, and lets a test drive resize/input. */
export class RecordingTerminal implements TerminalDevice {
  readonly capabilities = {
    hasTrueColor: true,
    has256Color: true,
    supportsDec2026Sync: true,
    supportsKittyKeyboard: false,
    supportsBracketedPaste: true,
    insideMultiplexer: false,
  };
  writes: string[] = [];
  columns = 40;
  rows = 10;
  pending = 0;
  stopped = false;
  resize: () => void = () => {};
  input: (data: string) => void = () => {};

  getDimensions(): { readonly columns: number; readonly rows: number } {
    return { columns: this.columns, rows: this.rows };
  }

  getPendingOutputBytes(): number {
    return this.pending;
  }

  write(data: string): void {
    this.writes.push(data);
  }

  start(
    onInput: (data: string) => void,
    onResize: () => void,
    _onDisconnect: () => void,
    _options?: TerminalStartOptions,
  ): void {
    this.input = onInput;
    this.resize = onResize;
  }

  stop(): void {
    this.stopped = true;
  }

  enableInput(): void {}

  /** Everything written since the last call, as one string. */
  drain(): string {
    const joined = this.writes.join("");
    this.writes = [];
    return joined;
  }
}

/** Scheduler whose timers only run when the test says so. */
export class ManualScheduler implements RenderScheduler {
  private timers: Array<{ id: number; run: () => void }> = [];
  private nextId = 1;
  clock = 0;

  setTimeout(callback: () => void, _delayMs: number): unknown {
    const id = this.nextId++;
    this.timers.push({ id, run: callback });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.timers = this.timers.filter((timer) => timer.id !== handle);
  }

  setImmediate(callback: () => void): unknown {
    const id = this.nextId++;
    this.timers.push({ id, run: callback });
    return id;
  }

  now(): number {
    return this.clock;
  }

  /** Run queued callbacks until the queue drains, bounded against loops. */
  flush(rounds = 8): void {
    for (let round = 0; round < rounds && this.timers.length > 0; round++) {
      const due = this.timers;
      this.timers = [];
      for (const timer of due) timer.run();
    }
  }
}
