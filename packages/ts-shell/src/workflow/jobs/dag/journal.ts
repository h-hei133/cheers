import { randomUUID } from 'node:crypto';
import { sameValue } from '../../../config/values.js';
import type { WorkflowFile } from '../../../core/workflow/definition.js';
import { JobStateError } from '../model.js';
import type { JobOrigin } from '../contract.js';
import { JobStore } from '../store.js';
import { dagDigest } from './codec.js';
import type { DagJob, DagStep } from './model.js';

export class DagJournal {
  constructor(readonly store: JobStore) {}
  list(): readonly DagJob[] { return this.store.read().dags ?? []; }
  get(id: string): DagJob { const job = this.list().find(job => job.id === id); if (!job) throw new JobStateError('unavailable'); return job; }
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
  step(id: string, stepId: string, change: Pick<Partial<DagStep>, 'status' | 'dispatchPossible'>): DagJob {
    const job = this.get(id);
    if (!job.steps.some(step => step.id === stepId)) throw new JobStateError('invalid');
    return this.change(job, { steps: job.steps.map(step => step.id === stepId ? { ...step, ...change } : step) });
  }
}
