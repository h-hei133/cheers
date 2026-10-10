import { sameValue } from '../../../config/values.js';
import type { JobJournal } from '../model.js';
import { valid } from '../validation.js';

/** Reserved graph children count once, whether or not their local row exists. */
export function journalIds(journal: JobJournal): ReadonlySet<string> {
  return new Set([...journal.jobs, ...journal.local ?? [], ...journal.agents ?? [], ...journal.dags ?? []].map(job => job.id)
    .concat((journal.dags ?? []).flatMap(job => job.steps.map(step => step.jobId))));
}

export function validateDagChildren(journal: JobJournal): void {
  const owners = new Set([...journal.jobs, ...journal.agents ?? [], ...journal.dags ?? []].map(job => job.id));
  const children = new Set<string>();
  for (const job of journal.dags ?? []) for (const [index, step] of job.steps.entries()) {
    valid(!children.has(step.jobId) && !owners.has(step.jobId)); children.add(step.jobId);
    const child = journal.local?.find(row => row.id === step.jobId);
    if (child) {
      const declared = job.definition.steps[index]!;
      valid(job.dispatchPossible && step.dispatchPossible && child.command === declared.run
        && child.timeoutMs === declared.timeoutSeconds * 1000 && sameValue(child.directory, job.directory)
        && sameValue(child.origin, job.origin) && sameValue(child.scope, job.scope));
    }
    valid(step.status !== 'completed' || child?.status === 'completed' && child.output === 'complete');
  }
  valid(journalIds(journal).size <= 128);
}

/** Keep room for future immutable child metadata; output is reserved by the local owner on admission. */
export function reservedDagBytes(journal: JobJournal): number {
  let bytes = 0;
  for (const job of journal.dags ?? []) {
    if (!['queued', 'running', 'paused', 'unknown'].includes(job.status) || job.status === 'paused' && job.dispatchPossible) continue;
    for (const [index, step] of job.steps.entries()) {
      if (['skipped', 'cancelled', 'failed', 'completed'].includes(step.status) || journal.local?.some(child => child.id === step.jobId)) continue;
      const declared = job.definition.steps[index]!;
      bytes += Buffer.byteLength(JSON.stringify({ id: step.jobId, ownerId: '0'.repeat(36), command: declared.run, directory: job.directory,
        timeoutMs: declared.timeoutSeconds * 1000, origin: job.origin, scope: job.scope, createdAt: Number.MAX_SAFE_INTEGER,
        backend: 'local', digest: '0'.repeat(64), status: 'unknown', dispatchPossible: true, stdout: '', stderr: '',
        truncated: false, output: 'unknown', note: ' '.repeat(1024) }));
    }
  }
  return bytes;
}
