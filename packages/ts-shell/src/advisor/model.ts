import type { BoundSessionScope } from '../session/store/contract.js';
import type { TurnCheckpoint } from '../turn/checkpoint.js';
import type { SubagentRunner } from '../core/subagents/runner.js';
import type { ProcessOwner } from '../core/state/owner.js';

export interface AdvisorConfig { readonly target: string; readonly every: number; readonly timeoutMs: number; readonly mode: 'turn' | 'end' }
export type AdvisorStatus = 'off' | 'ready' | 'held' | 'reviewing' | 'reviewed' | 'paused' | 'no-model' | 'unavailable' | 'error' | 'timeout' | 'cancelled' | 'stale';
export interface AdvisorCheckpoint {
  readonly id: string;
  readonly timestamp: string;
  readonly sourcePromptEntryId: string;
  readonly step: number;
  readonly willContinue: boolean;
  readonly failed: boolean;
  readonly digest: string;
  readonly text: string;
  readonly truncated: boolean;
  readonly frontier: string;
  readonly goal: string;
}
export interface AdvisorNote {
  readonly id: string;
  readonly checkpointId: string;
  readonly checkpointDigest: string;
  readonly epoch: number;
  readonly target: string;
  readonly timestamp: string;
  readonly text: string;
  readonly submittedAt?: string;
  readonly coverage: { readonly checkpoints: readonly { readonly id: string; readonly digest: string }[]; readonly truncated: boolean };
}
export interface AdvisorState extends BoundSessionScope {
  readonly schemaVersion: 1;
  readonly epoch: number;
  readonly enabled: boolean;
  readonly config?: AdvisorConfig;
  readonly status: AdvisorStatus;
  readonly eligible: number;
  readonly captured: number;
  readonly checkpoints: readonly AdvisorCheckpoint[];
  readonly notes: readonly AdvisorNote[];
  readonly pending?: { readonly id: string; readonly epoch: number; readonly checkpointId: string; readonly startedAt: string; readonly owner?: ProcessOwner };
}
export interface AdvisorBoundary extends TurnCheckpoint { readonly sourcePromptEntryId: string }
export interface AdvisorReview { readonly checkpoint: AdvisorCheckpoint; readonly runner: SubagentRunner; readonly signal?: AbortSignal }
