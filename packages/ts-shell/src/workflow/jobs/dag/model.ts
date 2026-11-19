import type { WorkflowFile } from '../../../core/workflow/definition.js';
import type { BoundSessionScope } from '../../../session/store/contract.js';
import type { JobOrigin, JobStatus } from '../contract.js';

export interface DagStep {
  readonly id: string;
  /** Reserved once, before any possible command creation or dispatch. */
  readonly jobId: string;
  readonly status: JobStatus | 'skipped';
  readonly dispatchPossible: boolean;
}
export interface DagOwner {
  readonly id: string;
  readonly pid: number;
  /** Recorded only where the host can verify that the previous process is gone. */
  readonly namespace?: string;
}
export interface DagJob {
  readonly id: string;
  readonly backend: 'dag';
  readonly definition: WorkflowFile;
  readonly digest: string;
  readonly origin: JobOrigin;
  readonly scope: BoundSessionScope;
  readonly directory: BoundSessionScope['workspace'];
  readonly createdAt: number;
  readonly status: JobStatus | 'paused';
  readonly dispatchPossible: boolean;
  readonly owner?: DagOwner;
  readonly steps: readonly DagStep[];
  readonly note: string;
}
export interface DagRuntime {
  readonly directory: BoundSessionScope['workspace'];
  readonly admission: () => string | undefined;
  readonly runStep: (input: { readonly job: DagJob; readonly step: DagStep; readonly signal: AbortSignal }) => Promise<JobStatus>;
}
