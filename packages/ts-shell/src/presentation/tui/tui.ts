import { visibleWidth, truncateToWidth, coalesceAdjacentSgr } from "./utils.js";
import { processTerminal, type Terminal } from "./terminal.js";
import type { TerminalFramePlan, TerminalFrameProvider, ViewportSize, RenderScheduler } from "./frame-plan.js";
import { DefaultRenderScheduler } from "./frame-plan.js";

export type { TerminalFramePlan, TerminalFrameProvider, ViewportSize, HistoryBatch } from "./frame-plan.js";

const MIN_RENDER_INTERVAL_MS = Math.floor(1000 / 30);
const MAX_ADAPTIVE_DELAY_MS = 200;
const OUTPUT_BACKLOG_THRESHOLD = 256 * 1024;
const BACKLOG_RETRY_MS = 10;

export const CURSOR_MARKER = "\x1b_cursor:c\x07";

export class TUI {
  private readonly terminal: Terminal;
  private readonly scheduler: RenderScheduler;
  private frameProvider?: TerminalFrameProvider;
  private active = false;

  private prevViewport: string[] = [];
  private acceptedHistoryBatchId = 0;
  private renderPending = false;
  private lastFrameCostMs = 0;
  private forceNextRender = false;
  private clearScrollbackNextRender = false;

  constructor(
    terminal: Terminal = processTerminal,
    scheduler: RenderScheduler = DefaultRenderScheduler,
  ) {
    this.terminal = terminal;
    this.scheduler = scheduler;
  }

  setFrameProvider(provider: TerminalFrameProvider): void {
    this.frameProvider = provider;
  }

  start(): void {
    this.active = true;
    this.terminal.start(
      () => {},
      () => this.requestRender({ force: true }),
      () => {},
    );
    this.requestRender({ force: true });
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.flushHistoryBeforeStop();
    this.terminal.write("\x1b[?25h");
    this.terminal.stop();
  }

  requestRender(options?: { force?: boolean; clearScrollback?: boolean }): void {
    if (!this.active) return;
    if (options?.force) this.forceNextRender = true;
    if (options?.clearScrollback) this.clearScrollbackNextRender = true;

    if (this.renderPending) return;
    this.renderPending = true;
    this.scheduler.setImmediate(() => {
      this.renderPending = false;
      this.scheduleRender();
    });
  }

  renderNow(): void {
    this.forceNextRender = true;
    this.doRender({ force: true });
  }

  private scheduleRender(): void {
    const adaptiveDelay = Math.min(MAX_ADAPTIVE_DELAY_MS, this.lastFrameCostMs * 2);
    const delay = Math.max(MIN_RENDER_INTERVAL_MS, adaptiveDelay);
    this.scheduler.setTimeout(() => {
      this.doRender();
    }, delay);
  }
  private doRender(options?: { force?: boolean; clearScrollback?: boolean }): void {
    if (!this.frameProvider) return;

    const force = options?.force || this.forceNextRender;
    const clearScrollback = options?.clearScrollback || this.clearScrollbackNextRender;
    this.forceNextRender = false;
    this.clearScrollbackNextRender = false;

    if (clearScrollback) {
      this.frameProvider.beginHistoryReplay?.();
    }

    if (this.terminal.getPendingOutputBytes() > OUTPUT_BACKLOG_THRESHOLD && !force) {
      this.scheduler.setTimeout(() => this.doRender(options), BACKLOG_RETRY_MS);
      return;
    }

    const frameStart = Date.now();
    const dims = this.terminal.getDimensions();
    const plan = this.frameProvider.renderFrame(dims);

    this.emitPlanFrame(plan, dims, force, clearScrollback);
    this.lastFrameCostMs = Date.now() - frameStart;
  }

  private emitPlanFrame(plan: TerminalFramePlan, dims: ViewportSize, force: boolean, clearScrollback: boolean): void {
    const commands: string[] = [];

    // 1. Commit history batch to native scrollback
    if (plan.history && plan.history.rows.length > 0 && plan.history.id > this.acceptedHistoryBatchId) {
      const historyText = plan.history.rows.map((r) => `${r}\r\n`).join("");
      this.terminal.write(historyText);
      this.frameProvider?.acknowledgeHistory(plan.history.id);
      this.acceptedHistoryBatchId = plan.history.id;
      this.prevViewport = [];
    }

    // 2. Prepare viewport lines with SGR coalescing and truncation
    const viewport = plan.viewport.map((line) =>
      coalesceAdjacentSgr(truncateToWidth(line, dims.columns)),
    );

    // 3. Calculate bottom-pinned anchor
    const topAnchor = Math.max(0, dims.rows - viewport.length);

    // 4. Extract CURSOR_MARKER and prepare lines
    let cursorRow = -1;
    let cursorCol = -1;
    const preparedLines: string[] = [];

    for (let i = 0; i < viewport.length; i++) {
      let line = viewport[i];
      if (line.includes(CURSOR_MARKER)) {
        const markerIdx = line.indexOf(CURSOR_MARKER);
        cursorRow = topAnchor + i + 1;
        cursorCol = visibleWidth(line.slice(0, markerIdx)) + 1;
        line = line.replace(CURSOR_MARKER, "");
      }
      preparedLines.push(line);
    }

    // 5. Diff viewport against previous frame
    for (let i = 0; i < preparedLines.length; i++) {
      const physicalRow = topAnchor + i + 1;
      const prevLine = force ? undefined : this.prevViewport[i];
      const nextLine = preparedLines[i];

      if (prevLine !== nextLine) {
        commands.push(`\x1b[${physicalRow};1H\x1b[2K${nextLine}`);
      }
    }

    // 6. Clear stale rows if viewport shrank
    if (this.prevViewport.length > preparedLines.length) {
      for (let i = preparedLines.length; i < this.prevViewport.length; i++) {
        commands.push(`\x1b[${topAnchor + i + 1};1H\x1b[2K`);
      }
    }

    // 7. Clear scrollback if requested
    if (clearScrollback) {
      commands.unshift("\x1b[2J\x1b[H");
    }

    this.prevViewport = preparedLines;

    if (commands.length === 0 && cursorRow === -1) return;

    // 8. Atomic paint with DECAWM disable + DEC 2026 sync + cursor pin inside frame
    const paintStart = "\x1b[?25l\x1b[?2026h\x1b[?7l";
    const paintEnd = "\x1b[?7h\x1b[?2026l";

    let cursorPin = "";
    if (cursorRow > 0 && cursorCol > 0) {
      cursorPin = `\x1b[${cursorRow};${cursorCol}H\x1b[?25h`;
    }

    const payload = `${paintStart}${commands.join("")}${cursorPin}${paintEnd}`;
    this.terminal.write(payload);
  }

  private flushHistoryBeforeStop(): void {
    if (!this.frameProvider) return;
    for (let attempts = 0; attempts < 10; attempts++) {
      const dims = this.terminal.getDimensions();
      const plan = this.frameProvider.renderFrame(dims);
      if (!plan.history || plan.history.rows.length === 0) break;
      const historyText = plan.history.rows.map((r) => `${r}\r\n`).join("");
      this.terminal.write(historyText);
      this.frameProvider.acknowledgeHistory(plan.history.id);
      this.acceptedHistoryBatchId = plan.history.id;
    }
  }
}
