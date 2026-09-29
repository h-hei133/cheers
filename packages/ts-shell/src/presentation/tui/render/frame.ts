/**
 * Frame contract between the render engine and the product surface.
 *
 * The surface composes the whole screen and the engine paints it. That is the
 * entire contract: one array of rows, top row first.
 *
 * It used to be two channels — a mutable viewport plus batches of finished rows
 * handed to the terminal's own scrollback — because the session was drawn on the
 * normal screen. On the alternate screen there is no terminal scrollback to hand
 * anything to, so scrolling is ours, and the surface is the only thing that knows
 * how far back the user has scrolled.
 */

export interface ViewportSize {
  readonly columns: number;
  readonly rows: number;
}

export interface TerminalFramePlan {
  /** Exactly the rows to paint, top row first. Longer than the screen is clipped. */
  readonly rows: readonly string[]
  /**
   * The bottom block that stays put when the surface is not the whole screen.
   *
   * On the alternate screen the surface owns every row, so a frame is just rows.
   * On the main screen the transcript is appended to the terminal's own
   * scrollback and only this block is redrawn in place — so the two have to be
   * separable, and the provider is the only thing that knows where the split is.
   *
   * Absent means the frame has no fixed region and every row is content.
   */
  readonly chromeRows?: readonly string[]
  /**
   * Every row of the surface's content, not only the ones that fit on screen.
   *
   * On the alternate screen the viewport *is* the content: rows that do not fit
   * are scrolled to, not lost. A surface appending to the terminal's scrollback
   * has no viewport, so it needs the whole document — the window onto it would
   * silently drop everything that scrolled past.
   *
   * Supplied as a function rather than an array so a frame that never asks pays
   * nothing: the alternate screen composes a viewport and does not want the
   * document, and composing it cost a walk over every block on every frame.
   * Absent means `rows` is already the whole document.
   */
  readonly documentRows?: () => readonly string[]
}

export interface TerminalFrameProvider {
  /** Compose the whole screen at this size. */
  renderFrame(dimensions: ViewportSize): TerminalFramePlan;
}

export interface TuiStartOptions {
  /** Paint without taking over stdin, so cooked-mode echo stays usable. */
  readonly deferInput?: boolean;
  /**
   * Whether the surface may take the alternate screen.
   *
   * `false` keeps the conversation in the terminal's own scrollback: the
   * transcript is appended once and never rewritten, and only the fixed block at
   * the bottom is redrawn. That is what leaves something to scroll back through
   * after the session ends, at the cost of not being able to reflow history.
   *
   * Defaults to `true`, which is the full-screen behavior every surface has had.
   */
  readonly useAlternateScreen?: boolean;
}

export interface TuiStopOptions {
  /**
   * Rows to leave in the terminal's own scrollback once the screen is given
   * back. Nothing on the screen survives leaving it; this is what does.
   */
  readonly document?: readonly string[];
}

export interface RenderRequestOptions {
  readonly force?: boolean;
}

export interface RenderScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
  setImmediate(callback: () => void): unknown;
  now(): number;
}

export const defaultRenderScheduler: RenderScheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  setImmediate: (callback) => setImmediate(callback),
  now: () => Date.now(),
};
