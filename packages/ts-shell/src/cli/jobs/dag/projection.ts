import type { DagJob } from '../../../workflow/jobs/dag/model.js';
import type { JobsComposition } from '../model.js';
import { localProjection } from '../projection.js';

export function dagProjection(host: JobsComposition, job: DagJob) {
  const live = host.dags.hasLive(job.id);
  const local = host.jobs.read().local ?? [];
  return { id: job.id, backend: job.backend, name: job.definition.name, source: job.definition.source, fingerprint: job.definition.fingerprint,
    origin: job.origin, status: job.status === 'running' && !live ? 'unknown' : job.status, storedStatus: job.status,
    liveOwner: live, dispatchPossible: job.dispatchPossible, maxConcurrency: Math.min(job.definition.maxConcurrency, 2),
    steps: job.steps.map(step => { const child = local.find(row => row.id === step.jobId); return { ...step,
      status: !live && ['running', 'unknown'].includes(step.status) ? 'unknown' : step.status,
      command: job.definition.steps.find(entry => entry.id === step.id)!.run,
      needs: job.definition.steps.find(entry => entry.id === step.id)!.needs,
      ...(child ? { commandJob: localProjection(host, child) } : {}) }; }),
    note: job.note, completionProof: false };
}
