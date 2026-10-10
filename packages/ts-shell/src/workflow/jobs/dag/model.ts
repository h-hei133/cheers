import type { WorkflowFile } from '../../../core/workflow/definition.js';
import type { BoundSessionScope } from '../../../session/store/bound.js';
import type { JobOrigin, JobStatus } from '../contract.js';

export interface DagStep {
  readonly id: string;
  /** Reserved once, before any possible command creation or dispatch. */
  readonly jobId: string;
  readonly status: JobStatus | 'skipped';
  readonly dispatchPossible: boolean;
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
  readonly steps: readonly DagStep[];
  readonly note: string;
}
export interface DagRuntime {
  readonly directory: BoundSessionScope['workspace'];
  readonly admission: () => string | undefined;
  readonly runStep: (input: { readonly job: DagJob; readonly step: DagStep; readonly signal: AbortSignal }) => Promise<JobStatus>;
}
