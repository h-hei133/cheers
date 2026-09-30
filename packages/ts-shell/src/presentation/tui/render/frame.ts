/**
 * Frame contract between the render engine and the product surface.
 *
 * The surface composes the whole screen and the engine paints it. That is the
 * entire contract: one array of rows, top row first.
 *
 * The engine chooses a document for the terminal's own scrollback or a viewport
 * for the alternate screen before composition. Both use the same decorated rows;
 * the painter decides how those rows reach the terminal.
 */

export interface ViewportSize {
  readonly columns: number;
  readonly rows: number;
}

export type FrameLayout = "document" | "viewport";

export interface TerminalFramePlan {
  /** A bounded overlay must not become permanent terminal scrollback. */
  readonly fullScreen?: boolean;
  /** Exactly the requested document or viewport rows, including the fixed tail. */
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
}

export interface TerminalFrameProvider {
  /** Compose one decorated layout; a direct caller defaults to a viewport. */
  renderFrame(dimensions: ViewportSize, layout?: FrameLayout): TerminalFramePlan;
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
