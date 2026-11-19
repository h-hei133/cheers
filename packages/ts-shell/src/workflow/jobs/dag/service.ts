import { DAGResolver } from '../../../core/workflow/dagResolver.js';
import { ParallelDispatcher } from '../../../core/workflow/parallelDispatcher.js';
import { sameValue } from '../../../config/values.js';
import type { WorkflowFile } from '../../../core/workflow/definition.js';
import { JobStateError } from '../model.js';
import type { JobOrigin, JobStatus } from '../contract.js';
import { settledWithin } from '../settlement.js';
import { DagJournal } from './journal.js';
import type { DagJob, DagRuntime } from './model.js';
import { captureDagOwner, type DagResume } from './resume.js';

interface Operation {
  readonly owner: string;
  readonly controller: AbortController;
  done: Promise<void>;
  uncertain?: boolean;
  requested?: 'paused' | 'cancelled';
}
export class DagService {
  private readonly operations = new Map<string, Operation>();
  private closing = false;
  constructor(readonly journal: DagJournal) {}
  hasLive(id: string): boolean { return this.operations.has(id); }
  create(definition: WorkflowFile, origin: JobOrigin, runtime: DagRuntime, queue = false): DagJob {
    if (this.closing || runtime.admission()) throw new JobStateError('unavailable');
    const job = this.journal.create(definition, origin, runtime.directory); return queue ? job : this.start(job, runtime);
  }
  resumePlan(expected: DagJob): DagResume | undefined {
    return this.closing || this.hasLive(expected.id) ? undefined : this.journal.resumePlan(expected);
  }
  start(expected: DagJob, runtime: DagRuntime, approved?: DagResume): DagJob {
    if (this.closing || this.hasLive(expected.id) || runtime.admission() || !sameValue(expected.directory, runtime.directory))
      throw new JobStateError('conflict');
    const owner = captureDagOwner();
    const job = this.journal.claim(expected, owner, approved);
    const operation: Operation = { owner: owner.id, controller: new AbortController(), done: Promise.resolve() };
    this.operations.set(job.id, operation);
    const watch = setInterval(() => { if (runtime.admission()) operation.controller.abort(); }, 100); watch.unref();
    operation.done = Promise.resolve().then(() => this.run(job, runtime, operation)).catch(() => {
      operation.controller.abort();
      try { this.journal.change(this.journal.owned(job.id, operation.owner), { status: 'unknown', note: 'Graph cleanup or durable publication is unverified.' }); } catch { /* The dispatch fence remains. */ }
    }).finally(() => { clearInterval(watch); this.operations.delete(job.id); });
    return job;
  }
  private async run(job: DagJob, runtime: DagRuntime, operation: Operation): Promise<void> {
    const graph = DAGResolver.resolve(job.definition.steps.map(step => ({ id: step.id, name: step.id, dependencies: step.needs, status: 'pending' })));
    let halted = false;
    for (const batch of graph.executionBatches) {
      const remaining = batch.filter(id => job.steps.find(step => step.id === id)?.status !== 'completed');
      if (remaining.length === 0) continue;
      if (halted || operation.controller.signal.aborted || runtime.admission()) {
        for (const id of remaining) this.journal.step(job.id, id, { status: 'skipped' }, operation.owner);
        halted = true; continue;
      }
      // Every worker contains publication failures, so the existing dispatcher
      // awaits every sibling's native cleanup before releasing this graph owner.
      const results = await ParallelDispatcher.run(remaining.map(id => () => this.step(job.id, id, runtime, operation)),
        { maxConcurrency: Math.min(job.definition.maxConcurrency, 2) });
      if (results.some(status => status !== 'completed')) halted = true;
    }
    const current = this.journal.owned(job.id, operation.owner);
    const status = operation.uncertain || current.steps.some(step => step.status === 'unknown' || step.status === 'running') ? 'unknown'
      : operation.controller.signal.aborted ? operation.requested ?? 'cancelled' : halted ? 'failed' : 'completed';
    this.journal.change(current, { status, note: status === 'unknown' ? 'Native command cleanup, output or publication is unverified.'
      : status === 'completed' ? 'Every approved command settled successfully; goal acceptance remains separate.' : 'Scheduling halted; inspect retained step and native command facts.' });
  }
  private async step(id: string, stepId: string, runtime: DagRuntime, operation: Operation): Promise<JobStatus> {
    try {
      if (operation.controller.signal.aborted || runtime.admission()) {
        this.journal.step(id, stepId, { status: 'cancelled' }, operation.owner); return 'cancelled';
      }
      const armed = this.journal.step(id, stepId, { dispatchPossible: true, status: 'running' }, operation.owner);
      const status = await runtime.runStep({ job: armed, step: armed.steps.find(step => step.id === stepId)!, signal: operation.controller.signal });
      this.journal.step(id, stepId, { status }, operation.owner); return status;
    } catch {
      operation.uncertain = true; operation.controller.abort();
      // The immutable dispatch fence and reserved child ID remain even if the
      // store cannot publish this failure. A sibling still owns its live work.
      try { this.journal.step(id, stepId, { status: 'unknown' }, operation.owner); } catch { /* Retain the original fence. */ }
      return 'unknown';
    }
  }
  async stop(expected: DagJob, pause = false): Promise<boolean> {
    const current = this.journal.get(expected.id);
    if (current.digest !== expected.digest || !sameValue(current.scope, expected.scope)) throw new JobStateError('conflict');
    const operation = this.operations.get(expected.id);
    if (!operation) {
      if (!sameValue(current, expected)) throw new JobStateError('conflict');
      if (expected.dispatchPossible || !['queued', 'paused'].includes(expected.status)) return false;
      this.journal.change(expected, { status: pause ? 'paused' : 'cancelled', note: 'Undispatched scheduling intent halted.' }); return true;
    }
    if (expected.owner?.id !== operation.owner || current.owner?.id !== operation.owner) throw new JobStateError('conflict');
    operation.requested = pause ? 'paused' : 'cancelled'; operation.controller.abort();
    if (!await settledWithin(operation.done)) { this.journal.change(this.journal.owned(expected.id, operation.owner), { status: 'unknown', note: 'Command cleanup has not settled.' }); return false; }
    return this.journal.get(expected.id).status === operation.requested;
  }
  async close(): Promise<void> {
    this.closing = true; for (const operation of this.operations.values()) operation.controller.abort();
    if (!await settledWithin(this.drain())) for (const [id, operation] of this.operations) {
      try { this.journal.change(this.journal.owned(id, operation.owner), { status: 'unknown', note: 'Closing command cleanup remains unverified.' }); } catch { /* Lost authority cannot manufacture settlement. */ }
    }
  }
  drain(): Promise<void> { return Promise.allSettled([...this.operations.values()].map(operation => operation.done)).then(() => undefined); }
}
