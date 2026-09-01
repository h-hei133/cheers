import type { TerminalDevice } from "../terminal.js";
import { processTerminal } from "../terminal.js";
import {
  defaultRenderScheduler,
  type HistoryBatch,
  type RenderRequestOptions,
  type RenderScheduler,
  type ResizeScrollbackMode,
  type TerminalFramePlan,
  type TerminalFrameProvider,
  type TuiStartOptions,
  type ViewportSize,
} from "./frame.js";
import {
  clampToHeight,
  cursorPaint,
  cursorTarget,
  diffPaint,
  ENTER_ALT_SCREEN,
  eraseFromRow,
  EXIT_ALT_SCREEN,
  modalPaint,
  paintBegin,
  paintEnd,
  prepareRows,
  scrollPaint,
} from "./paint.js";

/**
 * Bottom-anchored differential renderer over the terminal's normal screen.
 *
 * The engine keeps one mutable window at {@link viewportTop}; everything above it
 * is history the terminal owns, reachable through its own scrollback. Retiring a
 * history batch writes it at the anchor and lets the write scroll, which both
 * publishes the rows and moves the anchor down by exactly the batch height. When
 * geometry is stable and nothing is retiring, the frame is a pure row diff.
 *
 * The alternate screen buffer is deliberately never entered: it has no
 * scrollback, so it would make retirement — and the user's own scroll wheel and
 * text selection — meaningless.
 */

const MIN_FRAME_INTERVAL_MS = Math.floor(1000 / 30);
const MAX_ADAPTIVE_DELAY_MS = 200;
const OUTPUT_BACKLOG_BYTES = 256 * 1024;
const BACKLOG_RETRY_MS = 10;
const RESIZE_SETTLE_MS = 120;

export class TUI {
  private readonly terminal: TerminalDevice;
  private readonly scheduler: RenderScheduler;
  private provider?: TerminalFrameProvider;

  private viewportTop = 0;
  private window: readonly string[] = [];
  private lastWidth = 0;
  private lastHeight = 0;
  private painted = false;
  private acceptedHistoryId = 0;

  private started = false;
  private stopped = false;
  private renderQueued = false;
  private frameTimer: unknown;
  private lastFrameCostMs = 0;
  private forceNextFrame = false;
  private resetScrollbackNextFrame = false;

  private modalActive = false;
  private resizeTimer: unknown;
  private resizeWidthChanged = false;
  private resizeMode: ResizeScrollbackMode;
  private readonly inputListeners = new Set<(data: string) => void>();

  constructor(
    terminal: TerminalDevice = processTerminal,
    scheduler: RenderScheduler = defaultRenderScheduler,
    resizeMode: ResizeScrollbackMode = "rebuild",
  ) {
    this.terminal = terminal;
    this.scheduler = scheduler;
    this.resizeMode = resizeMode;
  }

  setFrameProvider(provider: TerminalFrameProvider | undefined): void {
    this.provider = provider;
  }

  setResizeScrollback(mode: ResizeScrollbackMode): void {
    this.resizeMode = mode;
  }

  /**
   * Subscribe to raw stdin. The engine owns the terminal, so input reaches the
   * host through here rather than by attaching a second stdin listener that
   * would race the driver's own.
   */
  onInput(listener: (data: string) => void): () => void {
    this.inputListeners.add(listener);
    return () => this.inputListeners.delete(listener);
  }

  /** Take over stdin after a deferred start. */
  enableInput(): void {
    this.terminal.enableInput();
  }

  start(options?: TuiStartOptions): void {
    this.started = true;
    this.stopped = false;
    this.terminal.start(
      (data) => {
        for (const listener of this.inputListeners) listener(data);
      },
      () => this.onResize(),
      () => this.stop(),
      { deferInput: options?.deferInput === true },
    );
    this.requestRender({ force: true, clearScrollback: options?.clearScrollback === true });
  }

  stop(): void {
    if (!this.started || this.stopped) return;
    this.stopped = true;
    this.started = false;
    this.scheduler.clearTimeout(this.frameTimer);
    this.scheduler.clearTimeout(this.resizeTimer);
    if (this.modalActive) this.leaveModal();
    this.retireRemainingHistory();
    this.terminal.stop();
  }

  requestRender(options?: RenderRequestOptions): void {
    if (!this.started || this.stopped) return;
    if (options?.force) this.forceNextFrame = true;
    if (options?.clearScrollback) this.resetScrollbackNextFrame = true;
    if (this.renderQueued) return;
    this.renderQueued = true;
    this.scheduler.setImmediate(() => {
      this.renderQueued = false;
      const adaptive = Math.min(MAX_ADAPTIVE_DELAY_MS, this.lastFrameCostMs * 2);
      this.frameTimer = this.scheduler.setTimeout(
        () => this.renderNow(),
        Math.max(MIN_FRAME_INTERVAL_MS, adaptive),
      );
    });
  }

  renderNow(): void {
    if (this.stopped || !this.provider) return;
    if (!this.forceNextFrame && this.terminal.getPendingOutputBytes() > OUTPUT_BACKLOG_BYTES) {
      this.frameTimer = this.scheduler.setTimeout(() => this.renderNow(), BACKLOG_RETRY_MS);
      return;
    }
    const startedAt = this.scheduler.now();
    const dimensions = this.terminal.getDimensions();
    if (this.resetScrollbackNextFrame) this.provider.beginHistoryReplay?.();
    const plan = this.provider.renderFrame(dimensions);
    if (plan.modal) this.paintModal(plan.modal, dimensions);
    else this.paint(plan, dimensions);
    this.lastFrameCostMs = this.scheduler.now() - startedAt;
  }

  /** Screen row the mutable viewport currently starts on. */
  get viewportTopRow(): number {
    return this.viewportTop;
  }

  private onResize(): void {
    const { columns } = this.terminal.getDimensions();
    if (columns !== this.lastWidth) this.resizeWidthChanged = true;
    this.scheduler.clearTimeout(this.resizeTimer);
    this.requestRender({ force: true });
    this.resizeTimer = this.scheduler.setTimeout(() => this.settleResize(), RESIZE_SETTLE_MS);
  }

  /**
   * A width change makes the terminal rewrap every row it owns, including rows
   * already retired at the old width, so the anchor and the retired presentation
   * are both stale. Rebuilding is the only way back to a frame that matches the
   * new width: reset scrollback and let the surface republish its ledger. A
   * height-only change moves no columns, so a forced repaint is enough.
   */
  private settleResize(): void {
    const rebuild = this.resizeWidthChanged && this.resizeMode === "rebuild";
    this.resizeWidthChanged = false;
    this.requestRender(rebuild ? { force: true, clearScrollback: true } : { force: true });
  }

  /**
   * Paint a full-screen frame on the borrowed alternate screen, entering it on
   * the first such frame. Nothing about the normal screen changes while a modal
   * is up, so leaving restores the transcript without repainting it.
   */
  private paintModal(rows: readonly string[], dimensions: ViewportSize): void {
    const height = Math.max(1, dimensions.rows);
    const width = Math.max(1, dimensions.columns);
    let buffer = "";
    if (!this.modalActive) {
      this.modalActive = true;
      buffer += ENTER_ALT_SCREEN;
    }
    buffer += paintBegin(this.terminal.capabilities.supportsDec2026Sync);
    buffer += modalPaint(prepareRows(clampToHeight(rows, height), width), height);
    buffer += cursorPaint(null, 0);
    buffer += paintEnd(this.terminal.capabilities.supportsDec2026Sync);
    this.terminal.write(buffer);
    this.forceNextFrame = false;
    this.resetScrollbackNextFrame = false;
  }

  /**
   * Give the alternate screen back. The normal screen still holds the frame that
   * was there when the modal opened, so the viewport is repainted from the
   * engine's own window rather than rebuilt.
   */
  private leaveModal(): void {
    this.modalActive = false;
    this.terminal.write(EXIT_ALT_SCREEN);
    this.forceNextFrame = true;
  }

  private paint(plan: TerminalFramePlan, dimensions: ViewportSize): void {
    if (this.modalActive) this.leaveModal();
    const width = Math.max(1, dimensions.columns);
    const height = Math.max(1, dimensions.rows);
    const reset = this.resetScrollbackNextFrame;
    const force = this.forceNextFrame || reset;
    this.forceNextFrame = false;
    this.resetScrollbackNextFrame = false;

    const batch = this.acceptableHistory(plan.history);
    const historyRows = prepareRows(batch?.rows ?? [], width);
    const viewportSource = clampToHeight(plan.viewport, height);
    const viewportRows = prepareRows(viewportSource, width);

    const startTop = reset ? 0 : Math.min(this.viewportTop, height - 1);
    const newTop = Math.max(0, Math.min(startTop + historyRows.length, height - viewportRows.length));
    const stable = this.painted && this.lastWidth === width && this.lastHeight === height;
    const diffable =
      stable && !force && historyRows.length === 0 && startTop === newTop && this.window.length > 0;

    let buffer = paintBegin(this.terminal.capabilities.supportsDec2026Sync);
    if (reset) buffer += "\x1b[H\x1b[2J\x1b[3J";

    if (diffable) {
      buffer += diffPaint(this.window, viewportRows, newTop, height);
    } else {
      const pushed = Math.max(0, startTop + historyRows.length + viewportRows.length - height);
      if (!reset && pushed > this.viewportTop && this.window.length > 0) {
        buffer += eraseFromRow(this.viewportTop, height);
      }
      buffer += scrollPaint(historyRows, viewportRows, startTop, height);
    }

    buffer += cursorPaint(cursorTarget(viewportSource, newTop, height), newTop);
    buffer += paintEnd(this.terminal.capabilities.supportsDec2026Sync);
    this.terminal.write(buffer);

    this.window = viewportRows;
    this.viewportTop = newTop;
    this.lastWidth = width;
    this.lastHeight = height;
    this.painted = true;

    if (batch) {
      this.acceptedHistoryId = batch.id;
      this.provider?.acknowledgeHistory(batch.id);
      if (batch.kind !== "replay") this.requestRender();
    }
  }

  private acceptableHistory(offered: HistoryBatch | undefined): HistoryBatch | undefined {
    if (!offered) return undefined;
    if (offered.id > this.acceptedHistoryId && offered.rows.length > 0) return offered;
    this.provider?.acknowledgeHistory(offered.id);
    return undefined;
  }

  /**
   * Drain every batch the surface can still finalize so the whole session stays
   * in the terminal after exit rather than dying with the mutable viewport.
   */
  private retireRemainingHistory(): void {
    const provider = this.provider;
    if (!provider) return;
    provider.beginHistoryFlush?.();
    const dimensions = this.terminal.getDimensions();
    const width = Math.max(1, dimensions.columns);
    const rows: string[] = [];
    for (let guard = 0; guard < 64; guard++) {
      const batch = this.acceptableHistory(provider.renderFrame(dimensions).history);
      if (!batch) break;
      rows.push(...prepareRows(batch.rows, width));
      this.acceptedHistoryId = batch.id;
      provider.acknowledgeHistory(batch.id);
    }
    if (!this.painted) return;
    const cleared = eraseFromRow(this.viewportTop, Math.max(1, dimensions.rows));
    this.terminal.write(`${cleared}${rows.map((row) => `${row}\r\n`).join("")}`);
  }
}
