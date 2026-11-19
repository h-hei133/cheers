import { randomUUID } from 'node:crypto';
import { sameValue } from '../../../config/values.js';
import type { WorkflowFile } from '../../../core/workflow/definition.js';
import { JobStateError } from '../model.js';
import type { JobOrigin } from '../contract.js';
import { JobStore } from '../store.js';
import { dagDigest } from './codec.js';
import type { DagJob, DagOwner, DagStep } from './model.js';
import { planDagResume, type DagResume } from './resume.js';

export class DagJournal {
  constructor(readonly store: JobStore) {}
  list(): readonly DagJob[] { return this.store.read().dags ?? []; }
  get(id: string): DagJob { const job = this.list().find(job => job.id === id); if (!job) throw new JobStateError('unavailable'); return job; }
  owned(id: string, owner: string): DagJob {
    const job = this.get(id);
    if (job.owner?.id !== owner) throw new JobStateError('conflict');
    return job;
  }
  create(definition: WorkflowFile, origin: JobOrigin, directory: DagJob['directory']): DagJob {
    const id = randomUUID();
    this.store.update((current, scope) => {
      const dags = current.dags ?? [];
      if (dags.filter(job => ['queued', 'running', 'unknown'].includes(job.status) || job.status === 'paused' && !job.dispatchPossible).length >= 2)
        throw new JobStateError('capacity');
      const intent = { id, definition, origin, scope, directory, createdAt: Date.now(), steps: definition.steps.map(step => ({ id: step.id, jobId: randomUUID(), status: 'queued' as const, dispatchPossible: false })) };
      const job: DagJob = { ...intent, backend: 'dag', digest: dagDigest(intent), status: 'queued', dispatchPossible: false,
        note: 'Approved scheduling intent; each command still requires ordinary bash approval.' };
      return { ...current, dags: [...dags, job] };
    }); return this.get(id);
  }
  resumePlan(expected: DagJob): DagResume | undefined {
    const current = this.store.read();
    const job = current.dags?.find(candidate => candidate.id === expected.id);
    if (!job || !sameValue(job, expected)) throw new JobStateError('conflict');
    return planDagResume(job, current.local ?? []);
  }
  claim(expected: DagJob, owner: DagOwner, approved?: DagResume): DagJob {
    const saved = this.store.update((current, scope) => {
      const job = current.dags?.find(candidate => candidate.id === expected.id);
      if (!job || !sameValue(job, expected) || !sameValue(job.scope, scope)) throw new JobStateError('conflict');
      const plan = approved ? planDagResume(job, current.local ?? []) : undefined;
      if (approved ? !sameValue(approved, plan) : job.dispatchPossible || !['queued', 'paused'].includes(job.status))
        throw new JobStateError('conflict');
      const next: DagJob = { ...job, owner, dispatchPossible: true, status: 'running',
        note: plan ? 'Confirmed commands are retained. Remaining commands still require ordinary approval.'
          : 'The live scheduler may request approved commands. Dispatched commands are never replayed.' };
      return { ...current, dags: current.dags!.map(candidate => candidate.id === job.id ? next : candidate) };
    });
    return saved.dags!.find(job => job.id === expected.id)!;
  }
  change(expected: DagJob, change: Pick<Partial<DagJob>, 'status' | 'dispatchPossible' | 'steps' | 'note'>): DagJob {
    this.store.update((current, scope) => {
      const selected = current.dags?.find(job => job.id === expected.id);
      if (!sameValue(expected.scope, scope)) throw new JobStateError('detached');
      if (!selected || !sameValue(selected, expected) || selected.dispatchPossible && change.dispatchPossible === false) throw new JobStateError('conflict');
      const steps = change.steps ?? selected.steps;
      if (steps.length !== selected.steps.length || steps.some((step, index) => step.id !== selected.steps[index]!.id
        || step.jobId !== selected.steps[index]!.jobId || selected.steps[index]!.dispatchPossible && !step.dispatchPossible)) throw new JobStateError('conflict');
      return { ...current, dags: current.dags!.map(job => job.id === expected.id ? { ...job, ...change } : job) };
    }); return this.get(expected.id);
  }
  step(id: string, stepId: string, change: Pick<Partial<DagStep>, 'status' | 'dispatchPossible'>, owner: string): DagJob {
    const job = this.owned(id, owner);
    const step = job.steps.find(candidate => candidate.id === stepId);
    if (!step) throw new JobStateError('invalid');
    if (step.status === 'completed' || change.dispatchPossible && (step.dispatchPossible || step.status !== 'queued'))
      throw new JobStateError('conflict');
    return this.change(job, { steps: job.steps.map(step => step.id === stepId ? { ...step, ...change } : step) });
  }
}
