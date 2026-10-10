import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';

export interface LiveHandoff {
  readonly id: string;
  readonly signal: AbortSignal;
  settle(outcome: 'completed' | 'failed' | 'cancelled' | 'unknown'): void;
}
export const liveHandoffs = new WeakMap<ShellRuntimeContext, LiveHandoff>();
/** Only the shell that explicitly armed a selection may start it. Persisted selection is inspection, not restart authority. */
export const armedHandoffs = new WeakMap<ShellRuntimeContext, string>();
