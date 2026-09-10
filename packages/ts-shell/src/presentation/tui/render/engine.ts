import { DISABLE_MOUSE, ENABLE_MOUSE } from "../input/mouse.js";
import type { TerminalDevice } from "../terminal.js";
import { processTerminal } from "../terminal.js";
import {
  defaultRenderScheduler,
  type RenderRequestOptions,
  type RenderScheduler,
  type TerminalFrameProvider,
  type TuiStartOptions,
  type TuiStopOptions,
  type ViewportSize,
} from "./frame.js";
import {
  cursorPaint,
  cursorTarget,
  diffPaint,
  ENTER_ALT_SCREEN,
  fullPaint,
  leaveScreen,
  padToHeight,
  paintBegin,
  paintEnd,
  prepareRows,
} from "./paint.js";

/**
 * Differential renderer over the alternate screen.
 *
 * The whole session lives on a screen of its own. That is what makes the rest
 * simple: nothing the user had in their terminal is touched, leaving restores it
 * exactly, the mouse is ours so a drag can copy without a modifier, and there is
 * one frame to reason about rather than a mutable window sliding over history the
 * terminal owns.
 *
 * The cost is that the alternate screen has no scrollback, so scrolling belongs to
 * the surface: it composes the rows it wants shown, and this paints them. When the
 * geometry is unchanged the frame is a row diff; otherwise it is a full rewrite.
 */

const MIN_FRAME_INTERVAL_MS = Math.floor(1000 / 30);
const MAX_ADAPTIVE_DELAY_MS = 200;
const OUTPUT_BACKLOG_BYTES = 256 * 1024;
const BACKLOG_RETRY_MS = 10;

export class TUI {
  private readonly terminal: TerminalDevice;
  private readonly scheduler: RenderScheduler;
  private provider?: TerminalFrameProvider;

  private window: readonly string[] = [];
  private lastWidth = 0;
  private lastHeight = 0;
  private painted = false;

  private started = false;
  private stopped = false;
  private renderQueued = false;
  private frameTimer: unknown;
  private lastFrameCostMs = 0;
  private forceNextFrame = false;
  private mouseTracking = false;
  private readonly inputListeners = new Set<(data: string) => void>();

  constructor(
    terminal: TerminalDevice = processTerminal,
    scheduler: RenderScheduler = defaultRenderScheduler,
  ) {
    this.terminal = terminal;
    this.scheduler = scheduler;
  }

  setFrameProvider(provider: TerminalFrameProvider | undefined): void {
    this.provider = provider;
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
    this.terminal.write(ENTER_ALT_SCREEN);
    this.setMouseTracking(true);
    this.requestRender({ force: true });
  }

  stop(options?: TuiStopOptions): void {
    if (!this.started || this.stopped) return;
    this.stopped = true;
    this.started = false;
    this.scheduler.clearTimeout(this.frameTimer);
    this.setMouseTracking(false);
    // The driver restores every mode it may have set, unbuffered, and that
    // battery includes leaving the screen — which on most terminals also puts the
    // cursor back where it was when the screen was taken. So the driver goes
    // first, and only then is the screen left (again, harmlessly) and the
    // document written under it: written before the battery, it would be
    // overprinted by whatever came next at the restored cursor.
    this.terminal.stop();
    const width = Math.max(1, this.terminal.getDimensions().columns);
    const document = prepareRows(options?.document ?? [], width);
    this.terminal.write(leaveScreen(document, this.terminal.capabilities.supportsDec2026Sync));
  }

  requestRender(options?: RenderRequestOptions): void {
    if (!this.started || this.stopped) return;
    if (options?.force) this.forceNextFrame = true;
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
    this.paint(this.provider.renderFrame(dimensions).rows, dimensions);
    this.lastFrameCostMs = this.scheduler.now() - startedAt;
  }

  /** Every row currently on screen, top row first. */
  screenRows(): readonly string[] {
    return this.window;
  }

  /** Ask for mouse reports, or give the mouse back to the terminal. */
  setMouseTracking(enabled: boolean): void {
    if (this.mouseTracking === enabled) return;
    this.mouseTracking = enabled;
    this.terminal.write(enabled ? ENABLE_MOUSE : DISABLE_MOUSE);
  }

  private onResize(): void {
    this.requestRender({ force: true });
  }

  private paint(source: readonly string[], dimensions: ViewportSize): void {
    const width = Math.max(1, dimensions.columns);
    const height = Math.max(1, dimensions.rows);
    const force = this.forceNextFrame;
    this.forceNextFrame = false;

    const rows = padToHeight(prepareRows(source, width), height);
    const stable = this.painted && this.lastWidth === width && this.lastHeight === height;

    let buffer = paintBegin(this.terminal.capabilities.supportsDec2026Sync);
    buffer += stable && !force ? diffPaint(this.window, rows, 0, height) : fullPaint(rows, height);
    buffer += cursorPaint(cursorTarget(source, 0, height), 0);
    buffer += paintEnd(this.terminal.capabilities.supportsDec2026Sync);
    this.terminal.write(buffer);

    this.window = rows;
    this.lastWidth = width;
    this.lastHeight = height;
    this.painted = true;
  }
}
