/**
 * Frame contract between the render engine and the product surface.
 *
 * A frame has two channels. The mutable `viewport` is repainted in place every
 * frame and owns the bottom of the screen. An optional `history` batch is text
 * the surface has finalized: the engine writes it once, in order, so it lands in
 * the terminal's own scrollback and leaves the mutable viewport for good. The
 * surface must not re-render retired rows, which is what `acknowledgeHistory`
 * confirms — a batch is only retired once the engine has actually written it.
 */

export interface ViewportSize {
  readonly columns: number;
  readonly rows: number;
}

/**
 * `append` adds rows below whatever history is already on screen. `replay`
 * follows a scrollback reset and re-publishes the whole committed ledger.
 */
export type HistoryBatchKind = "append" | "replay";

export interface HistoryBatch {
  /** Monotonic per-surface id; the engine ignores any id it already accepted. */
  readonly id: number;
  readonly rows: readonly string[];
  readonly kind?: HistoryBatchKind;
}

export interface TerminalFramePlan {
  readonly history?: HistoryBatch;
  readonly viewport: readonly string[];
  /**
   * A full-screen frame that replaces the viewport entirely. While present the
   * engine borrows the alternate screen, so the transcript and the terminal's
   * scrollback are untouched and reappear intact when it goes away. Rows are
   * painted from the top; the surface owns the whole screen.
   */
  readonly modal?: readonly string[];
}

export interface TerminalFrameProvider {
  /** Compose the bounded viewport and the next ordered history batch. */
  renderFrame(dimensions: ViewportSize): TerminalFramePlan;
  /** Confirm that `id` reached the terminal and may be retired. */
  acknowledgeHistory(id: number): void;
  /** Prepare a complete replay of committed history after a scrollback reset. */
  beginHistoryReplay?(): void;
  /** Force every eligible finalized prefix to retire before shutdown. */
  beginHistoryFlush?(): void;
  /**
   * The last `rows` rows already retired into scrollback, re-rendered at
   * `width`. Only what is still on screen above the viewport is asked for, and
   * only so a drag across it can be turned back into text.
   */
  retiredTail?(width: number, rows: number): readonly string[];
}

export interface TuiStartOptions {
  /** Paint without taking over stdin, so cooked-mode echo stays usable. */
  readonly deferInput?: boolean;
  /** Reset scrollback before the first paint. */
  readonly clearScrollback?: boolean;
}

export interface RenderRequestOptions {
  readonly force?: boolean;
  readonly clearScrollback?: boolean;
}

/** How a settled resize refreshes rows already retired into scrollback. */
export type ResizeScrollbackMode = "rebuild" | "preserve";

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
