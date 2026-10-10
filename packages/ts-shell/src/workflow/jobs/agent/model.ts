import type { BoundSessionScope } from '../../../session/store/bound.js';
import type { JobOrigin, JobStatus } from '../contract.js';

export interface AgentChild {
  readonly scope: BoundSessionScope;
  readonly directoryIdentity: string;
}
export interface AgentCheckpoint {
  readonly entryId: string;
  readonly digest: string;
}
export interface AgentRun {
  readonly id: string;
  readonly prompt: string;
  readonly createdAt: number;
  readonly dispatchPossible: boolean;
  readonly status: JobStatus | 'paused';
  readonly checkpoint: AgentCheckpoint;
}
export interface AgentJob {
  readonly id: string;
  readonly backend: 'agent';
  readonly scope: BoundSessionScope;
  readonly origin: JobOrigin;
  readonly createdAt: number;
  readonly prompt: string;
  readonly digest: string;
  /** Reserved before creation, so an uncertain fork cannot create another child. */
  readonly childSessionId: string;
  readonly child?: AgentChild;
  readonly checkpoint?: AgentCheckpoint;
  readonly runs: readonly AgentRun[];
  readonly status: JobStatus | 'paused';
  readonly text: string;
  readonly truncated: boolean;
  readonly output: 'pending' | 'complete' | 'interrupted' | 'unknown';
  readonly note: string;
}
export interface AgentOutcome {
  readonly status: 'completed' | 'failed' | 'unknown';
  readonly checkpoint?: AgentCheckpoint;
}
export interface AgentRuntime {
  readonly admission: () => string | undefined;
  readonly preflight: () => void;
  readonly childAdmission: (child: AgentChild) => string | undefined;
  readonly createChild: (sessionId: string) => { readonly child: AgentChild; readonly checkpoint: AgentCheckpoint };
  readonly checkpoint: (child: AgentChild) => AgentCheckpoint;
  readonly run: (input: { readonly job: AgentJob; readonly run: AgentRun; readonly signal: AbortSignal;
    readonly output: (text: string) => void }) => Promise<AgentOutcome>;
}
