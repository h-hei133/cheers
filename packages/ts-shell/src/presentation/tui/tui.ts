import { visibleWidth } from "./utils.js";
import { CURSOR_MARKER } from "./editor.js";
import { processTerminal, type ProcessTerminal } from "./terminal.js";
export interface HistoryBatch {
  readonly id: number;
  readonly lines: readonly string[];
}

export interface TerminalFramePlan {
  readonly history?: HistoryBatch;
  readonly viewport: readonly string[];
}

export interface TerminalFrameProvider {
  renderFrame(dimensions: { rows: number; cols: number }): TerminalFramePlan;
  acknowledgeHistory?(id: number): void;
}

/**
 * Production Core TUI Engine with Two-Channel Frame Provider
 *
 * Implements:
 * 1. HistoryBatch channel -> emitted as immutable lines into terminal scrollback
 * 2. Viewport channel -> double-buffered differential rendering in active window
 * 3. CURSOR_MARKER extraction & hardware cursor pinning (\x1b[row;colH\x1b[?25h)
 * 4. DEC 2026 atomic frame synchronization
 */
export class TUI {
  private prevViewport: string[] = [];
  private readonly terminal: ProcessTerminal;
  private frameProvider?: TerminalFrameProvider;
  private active = false;

  constructor(terminal: ProcessTerminal = processTerminal) {
    this.terminal = terminal;
  }

  setFrameProvider(provider: TerminalFrameProvider): void {
    this.frameProvider = provider;
  }

  start(): void {
    this.active = true;
    this.terminal.setRawMode(true);
    this.requestRender();
  }

  stop(): void {
    this.active = false;
    this.terminal.setRawMode(false);
  }

  requestRender(): void {
    if (!this.active || !this.frameProvider) return;
    const dims = this.terminal.getDimensions();
    const plan = this.frameProvider.renderFrame(dims);

    // 1. Commit History Batch to native terminal scrollback
    if (plan.history && plan.history.lines.length > 0) {
      for (const line of plan.history.lines) {
        this.terminal.write(`${line}\n`);
      }
      this.frameProvider.acknowledgeHistory?.(plan.history.id);
      this.prevViewport = []; // Reset viewport anchor after history commit
    }

    // 2. Render Viewport Frame with Differential Double-Buffering
    this.renderViewport(plan.viewport, dims.rows);
  }

  private renderViewport(viewport: readonly string[], totalRows: number): void {
    const commands: string[] = [];
    const maxLines = Math.max(this.prevViewport.length, viewport.length);
    const topAnchor = Math.max(0, totalRows - viewport.length);

    let cursorRow = -1;
    let cursorCol = -1;

    for (let i = 0; i < maxLines; i++) {
      const prevLine = this.prevViewport[i] ?? "";
      let nextLine = viewport[i] ?? "";

      // Extract CURSOR_MARKER if present
      if (nextLine.includes(CURSOR_MARKER)) {
        const markerIdx = nextLine.indexOf(CURSOR_MARKER);
        cursorRow = topAnchor + i + 1;
        cursorCol = visibleWidth(nextLine.slice(0, markerIdx)) + 1;
        nextLine = nextLine.replace(CURSOR_MARKER, "");
      }

      if (prevLine !== nextLine) {
        const physicalRow = topAnchor + i + 1;
        commands.push(`\x1b[${physicalRow};1H\x1b[2K${nextLine}`);
      }
    }

    this.prevViewport = viewport.map((l) => l.replace(CURSOR_MARKER, ""));

    if (commands.length === 0 && cursorRow === -1) {
      return;
    }

    // Wrap paint in DECAWM autowrap disable + DEC 2026 sync output
    const paintStart = "\x1b[?25l\x1b[?2026h\x1b[?7l";
    const paintEnd = "\x1b[?7h\x1b[?2026l";

    let cursorPin = "";
    if (cursorRow > 0 && cursorCol > 0) {
      cursorPin = `\x1b[${cursorRow};${cursorCol}H\x1b[?25h`;
    }

    const payload = `${paintStart}${commands.join("")}${paintEnd}${cursorPin}`;
    this.terminal.write(payload);
  }
}
