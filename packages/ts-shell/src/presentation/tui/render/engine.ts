import { DISABLE_MOUSE, ENABLE_MOUSE } from "../input/mouse.js";
import type { TerminalDevice, TerminalStartOptions } from "../terminal.js";
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
import { MainScreenPainter } from "./mainScreen.js";
import {
  cursorPaint,
  cursorTarget,
  diffPaint,
  ENTER_ALT_SCREEN,
  fullPaint,
  EXIT_ALT_SCREEN,
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
  /**
   * Set when the surface runs on the terminal's own screen.
   *
   * Constructed at start rather than in the field initializer because it needs
   * the terminal, and only one of the two painters is ever used.
   */
  private mainScreen?: MainScreenPainter;
  /**
   * Whether the surface took the alternate screen.
   *
   * Remembered rather than re-derived from `mainScreen`, which is cleared while a
   * child process holds the terminal: on restore the mode has to be the one the
   * session started with, not whatever the field happens to hold.
   */
  private alternateScreen = false;
  private readonly inputListeners = new Set<(data: string) => void>();
  private disconnectHandler?: () => void;

  private handleDisconnect = (): void => {
    if (this.disconnectHandler) {
      this.disconnectHandler();
    } else {
      this.stop();
    }
  };

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
  setDisconnectHandler(handler: (() => void) | undefined): void {
    this.disconnectHandler = handler;
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
    this.beginTerminal({ deferInput: options?.deferInput === true });
    this.alternateScreen = options?.useAlternateScreen !== false;
    this.enterScreen();
    this.setMouseTracking(true);
    this.requestRender({ force: true });
  }

  /**
   * Take the screen the session paints on.
   *
   * The alternate screen is a private screen with no scrollback: leaving it
   * restores the user's terminal exactly, and takes the conversation with it. The
   * terminal's own screen keeps the transcript instead, so a session that ends
   * leaves something to scroll back through.
   */
  private enterScreen(): void {
    if (this.alternateScreen) {
      this.terminal.write(ENTER_ALT_SCREEN);
      return;
    }
    this.mainScreen = new MainScreenPainter(this.terminal);
    this.mainScreen.start();
  }

  /** Give back whatever {@link enterScreen} took. */
  private leaveScreen(): void {
    if (this.mainScreen) {
      this.mainScreen.stop();
      this.mainScreen = undefined;
      return;
    }
    if (this.alternateScreen) this.terminal.write(EXIT_ALT_SCREEN);
  }

  /** Take stdin and paint the screen the session runs on. */
  private beginTerminal(options: TerminalStartOptions): void {
    this.terminal.start(
      (data) => {
        for (const listener of this.inputListeners) listener(data);
      },
      () => this.onResize(),
      this.handleDisconnect,
      options,
    );
  }

  /**
   * Give the terminal to `run`, then take it back.
   *
   * A child process that inherits this terminal would otherwise start inside raw
   * mode on a screen the surface owns: no echo, no line editing, and output that
   * the next frame overwrites. So every mode this driver set is restored, the
   * screen is given back, and the terminal is handed over in a state an ordinary
   * program can drive.
   *
   * Taking it back is in a `finally` because the failure that matters is not the
   * child failing — it is the child failing and leaving the session with no
   * terminal, which is indistinguishable from a hang.
   */
  suspend<T>(run: () => T): T {
    if (!this.started || this.stopped) return run();

    this.scheduler.clearTimeout(this.frameTimer);
    this.setMouseTracking(false);
    this.leaveScreen();
    // The driver restores every mode it may have set, unbuffered, and that
    // battery includes releasing raw mode — which is the whole point here.
    this.terminal.stop();

    try {
      return run();
    } finally {
      this.beginTerminal({});
      this.enterScreen();
      this.setMouseTracking(true);
      // The child wrote to the screen, so the next frame is a full paint rather
      // than a diff against rows that are no longer there.
      this.painted = false;
      this.window = [];
      this.requestRender({ force: true });
    }
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
    if (this.mainScreen) {
      // There is no screen to give back — this never took one. The rows the
      // caller wanted left behind are already in the scrollback, having been
      // appended as they were produced, so only the cursor has to be placed.
      this.mainScreen.stop();
      this.mainScreen = undefined;
      return;
    }
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
    const frame = this.provider.renderFrame(dimensions);
    if (this.mainScreen) {
      // The fixed block is redrawn in place; the content was appended to the
      // scrollback when it was first composed and is left alone. The whole
      // document is passed rather than the viewport, because there is no
      // viewport here — rows that do not fit are history, not something to
      // scroll to.
      this.mainScreen.paint(frame.documentRows ?? frame.rows, frame.chromeRows ?? []);
    } else {
      this.paint(frame.rows, dimensions);
    }
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
