import type { ExecutionAuthority } from '../../runtime/execution/types.js';
import { sameValue } from '../../config/values.js';
import { JobStore } from './store.js';
import { JobStateError, type JobOrigin, type RemoteJob } from './model.js';

export interface JobObservation {
  readonly invocationId?: string;
  readonly status: 'running' | 'completed' | 'failed' | 'cancelled' | 'unknown';
  readonly exitCode?: number;
  readonly output: 'complete' | 'interrupted' | 'unknown';
  readonly cancellation?: 'selected-cgroup-empty';
}
export interface RemoteJobBackend {
  readonly identity: string;
  check(): void;
  start(job: RemoteJob, authority: ExecutionAuthority, signal?: AbortSignal): Promise<string>;
  query(job: RemoteJob, invocation: string | undefined, authority: ExecutionAuthority, signal?: AbortSignal): Promise<JobObservation>;
  cancel(job: RemoteJob, invocation: string, authority: ExecutionAuthority, signal?: AbortSignal): Promise<JobObservation>;
  output(job: RemoteJob, stream: 'stdout' | 'stderr', offset: number, authority: ExecutionAuthority, signal?: AbortSignal): Promise<{
    readonly bytes: Buffer; readonly context?: Buffer; readonly nextOffset: number; readonly size: number; readonly truncated: boolean | 'unknown' } >;
}

/** The journal owns dispatch uncertainty; transport success never owns the job outcome. */
export class JobService {
  constructor(readonly store: JobStore, private readonly backend: RemoteJobBackend, private readonly admission: () => string | undefined) {}
  withAdmission(check: () => string | undefined): JobService {
    return new JobService(this.store, this.backend, () => this.admission() ?? check());
  }
  async run(command: string, origin: JobOrigin, authority: ExecutionAuthority, signal?: AbortSignal): Promise<RemoteJob> {
    this.check(authority, signal); const job = this.store.create(command, origin); return this.submit(job.id, authority, signal);
  }
  async submit(id: string, authority: ExecutionAuthority, signal?: AbortSignal): Promise<RemoteJob> {
    let job = this.selected(id, authority, signal);
    if (job.status !== 'queued' || job.dispatchPossible) throw new JobStateError('conflict');
    // This durable fence precedes every possible remote byte and is never cleared.
    job = this.store.change(id, job, { dispatchPossible: true, status: 'unknown', output: 'unknown', note: 'Dispatch may occur; this ID cannot be replayed.' });
    try {
      this.check(authority, signal);
      const invocationId = await this.backend.start(job, authority, signal); this.current(job, authority, signal);
      return this.store.change(id, job, { status: 'running', invocationId, note: 'Remote native unit acknowledged; reconcile to observe its outcome.' });
    } catch { return this.uncertain(job, 'Remote start was not confirmed; explicit reconciliation is required. This ID will never be replayed.'); }
  }
  async reconcile(id: string, authority: ExecutionAuthority, signal?: AbortSignal): Promise<RemoteJob> {
    const job = this.selected(id, authority, signal); if (!job.dispatchPossible) return job;
    try {
      const observation = await this.backend.query(job, job.invocationId, authority, signal); this.current(job, authority, signal);
      return this.observe(job, observation);
    } catch { return this.uncertain(job, 'Remote observation is unavailable or changed; prior dispatch uncertainty is retained.'); }
  }
  async cancel(id: string, authority: ExecutionAuthority, signal?: AbortSignal): Promise<RemoteJob> {
    let job = this.selected(id, authority, signal);
    if (!job.dispatchPossible) return this.store.change(id, job, { status: 'cancelled', note: 'Queued intent cancelled locally before any remote dispatch.' });
    if (['completed', 'failed', 'cancelled'].includes(job.status)) return job;
    job = this.store.change(id, job, { cancellation: 'requested', note: 'Exact remote cancellation requested; termination is not yet established.' });
    try {
      const observed = await this.backend.query(job, job.invocationId, authority, signal); this.current(job, authority, signal);
      if (job.invocationId && observed.invocationId && job.invocationId !== observed.invocationId) throw new JobStateError('conflict');
      if (['completed', 'failed', 'cancelled'].includes(observed.status)) return this.observe(job, observed);
      if (!observed.invocationId) return this.uncertain(job, 'Cancellation requested, but an exact remote invocation is unavailable.');
      const result = await this.backend.cancel(job, observed.invocationId, authority, signal); this.current(job, authority, signal);
      return this.observe(job, result);
    } catch { return this.uncertain(job, 'Cancellation requested; remote selected-cgroup termination could not be confirmed.'); }
  }
  async output(id: string, stream: 'stdout' | 'stderr', offset: number, authority: ExecutionAuthority, signal?: AbortSignal) {
    const job = this.selected(id, authority, signal); if (!job.dispatchPossible) throw new JobStateError('unavailable');
    const page = await this.backend.output(job, stream, offset, authority, signal); this.current(job, authority, signal); return page;
  }
  private selected(id: string, authority: ExecutionAuthority, signal?: AbortSignal): RemoteJob {
    this.check(authority, signal); const job = this.store.get(id);
    if (!sameValue(job.scope, this.store.scope())) throw new JobStateError('detached');
    if (job.binding.profileIdentity !== this.backend.identity) throw new JobStateError('conflict'); return job;
  }
  private check(authority: ExecutionAuthority, signal?: AbortSignal): void {
    if (authority.mode !== 'approved-for-write' || this.admission()) throw new JobStateError('unavailable');
    signal?.throwIfAborted(); this.backend.check();
  }
  private current(job: RemoteJob, authority: ExecutionAuthority, signal?: AbortSignal): void {
    this.check(authority, signal);
    if (!sameValue(job.scope, this.store.scope())) throw new JobStateError('detached');
    if (!sameValue(this.store.get(job.id), job)) throw new JobStateError('conflict');
  }
  private observe(job: RemoteJob, observation: JobObservation): RemoteJob {
    if (job.invocationId && observation.invocationId && job.invocationId !== observation.invocationId) throw new JobStateError('conflict');
    return this.store.change(job.id, job, { ...observation, invocationId: job.invocationId ?? observation.invocationId, note: observation.status === 'unknown'
      ? 'Remote record does not establish a terminal outcome; no retry was sent.'
      : `Remote reported ${observation.status}; output ${observation.output}. This is remote evidence, not local goal-completion proof.` });
  }
  private uncertain(job: RemoteJob, note: string): RemoteJob {
    if (!sameValue(job.scope, this.store.scope())) throw new JobStateError('detached');
    try { return this.store.change(job.id, job, { status: 'unknown', output: 'unknown', note }); }
    catch { throw new JobStateError('conflict'); }
  }
}
