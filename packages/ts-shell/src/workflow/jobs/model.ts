import type { BoundSessionScope } from '../../session/store/bound.js';
import type { SshWorkspace } from '../../runtime/execution/ssh/model.js';
import type { AgentJob } from './agent/model.js';
import type { DagJob } from './dag/model.js';
import type { JobOrigin, JobStatus } from './contract.js';
export type { JobOrigin, JobStatus } from './contract.js';
export type RemoteWorkspace = SshWorkspace;
export interface RemoteJob {
  readonly id: string;
  readonly backend: 'ssh';
  readonly command: string;
  readonly digest: string;
  readonly origin: JobOrigin;
  readonly scope: BoundSessionScope;
  readonly binding: RemoteWorkspace;
  readonly createdAt: number;
  /** Parent cancellation is approved with submission; restart never recreates that capability. */
  readonly lifetime: 'detached' | 'parent';
  readonly status: JobStatus;
  /** Immutable replay tombstone. Once true, this job ID is never submitted again. */
  readonly dispatchPossible: boolean;
  readonly invocationId?: string;
  readonly exitCode?: number;
  readonly output: 'pending' | 'complete' | 'interrupted' | 'unknown';
  readonly cancellation?: 'requested' | 'selected-cgroup-empty';
  readonly note: string;
}
export interface JobJournal {
  readonly version: 1;
  readonly revision: number;
  readonly scope: BoundSessionScope;
  readonly remote?: RemoteWorkspace;
  readonly jobs: readonly RemoteJob[];
  readonly local?: readonly LocalJob[];
  readonly agents?: readonly AgentJob[];
  readonly dags?: readonly DagJob[];
}
export interface LocalJob {
  readonly id: string;
  readonly backend: 'local';
  readonly ownerId: string;
  readonly command: string;
  readonly directory: BoundSessionScope['workspace'];
  readonly timeoutMs: number;
  readonly digest: string;
  readonly origin: JobOrigin;
  readonly scope: BoundSessionScope;
  readonly createdAt: number;
  readonly status: JobStatus | 'paused';
  readonly dispatchPossible: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly truncated: boolean;
  readonly output: 'pending' | 'complete' | 'interrupted' | 'unknown';
  readonly exitCode?: number;
  readonly note: string;
}
export class JobStateError extends Error {
  constructor(readonly code: 'invalid' | 'capacity' | 'conflict' | 'unavailable' | 'detached') {
    super(`Jobs ${code}; stored dispatch uncertainty is retained.`); this.name = 'JobStateError';
  }
}
