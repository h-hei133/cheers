import type { AgentMessage } from '../core/agent/state.js';
import type { SubagentRunner } from '../core/subagents/runner.js';

export interface TurnCheckpoint {
  readonly messages: readonly AgentMessage[];
  readonly step: number;
  readonly willContinue: boolean;
  readonly failed: boolean;
}
/** Awaited at the actual turn-end boundary, before context maintenance. */
export type TurnCheckpointHandler = {
  (checkpoint: TurnCheckpoint, runner: SubagentRunner, signal: AbortSignal): Promise<void>;
  /** Accept a verified main-account publication before this turn's first request. */
  readonly accountPublication?: import('../core/auth/account/contract.js').AccountPublication;
};
