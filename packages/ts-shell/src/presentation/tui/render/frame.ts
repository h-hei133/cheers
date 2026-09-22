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
  readonly rows: readonly string[];
}

export interface TerminalFrameProvider {
  /** Compose the whole screen at this size. */
  renderFrame(dimensions: ViewportSize): TerminalFramePlan;
}

export interface TuiStartOptions {
  /** Paint without taking over stdin, so cooked-mode echo stays usable. */
  readonly deferInput?: boolean;
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
