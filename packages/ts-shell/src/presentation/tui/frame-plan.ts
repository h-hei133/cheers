export interface ViewportSize {
  readonly columns: number;
  readonly rows: number;
}

export type HistoryBatchKind = "append" | "replay";

export interface HistoryBatch {
  readonly id: number;
  readonly rows: readonly string[];
  readonly kind?: HistoryBatchKind;
}

export interface TerminalFramePlan {
  readonly history?: HistoryBatch;
  readonly viewport: readonly string[];
}

export interface TerminalFrameProvider {
  renderFrame(dimensions: ViewportSize): TerminalFramePlan;
  acknowledgeHistory(id: number): void;
  renderResizeFrame?(dimensions: ViewportSize): TerminalFramePlan;
  beginHistoryReplay?(): void;
  beginHistoryFlush?(): void;
}

export interface TUIStartOptions {
  readonly deferInput?: boolean;
  readonly clearScrollback?: boolean;
}

export interface RenderRequestOptions {
  readonly force?: boolean;
  readonly clearScrollback?: boolean;
}

export type ResizeScrollbackMode = "append" | "rebuild" | "preserve";

export interface RenderScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
  setImmediate(callback: () => void): unknown;
}

export const DefaultRenderScheduler: RenderScheduler = {
  setTimeout: (cb, ms) => setTimeout(cb, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  setImmediate: (cb) => setImmediate(cb),
};
