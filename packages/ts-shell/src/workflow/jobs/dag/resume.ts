import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, readlinkSync } from 'node:fs';
import { DAGResolver } from '../../../core/workflow/dagResolver.js';
import type { LocalJob } from '../model.js';
import type { DagJob, DagOwner } from './model.js';

export interface DagResume {
  readonly completed: readonly string[];
  readonly pending: readonly string[];
  readonly evidence: string;
}

function processNamespace(): string | undefined {
  if (process.platform !== 'linux') return undefined;
  try {
    const boot = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
    const namespace = readlinkSync('/proc/self/ns/pid');
    if (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(boot) && /^pid:\[[0-9]{1,20}\]$/.test(namespace)) return `${boot}:${namespace}`;
  } catch { /* This host cannot verify ownership after restart. */ }
}

export function captureDagOwner(): DagOwner {
  const namespace = processNamespace();
  return { id: randomUUID(), pid: process.pid, ...(namespace ? { namespace } : {}) };
}

/** Missing, foreign or reused process identities leave the original schedule fenced. */
function ownerGone(owner: DagOwner | undefined): boolean {
  if (!owner?.namespace || owner.namespace !== processNamespace()) return false;
  try { process.kill(owner.pid, 0); } catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH'; }
  return false;
}

/** The journal decoder has already bound these child records to the immutable graph intent. */
export function planDagResume(job: DagJob, children: readonly LocalJob[]): DagResume | undefined {
  if (!job.dispatchPossible || job.status !== 'running' || !ownerGone(job.owner)) return;
  const completed: string[] = [], pending: string[] = [];
  const retained: LocalJob[] = [];
  for (const step of job.steps) {
    const child = children.find(row => row.id === step.jobId);
    // A native child can exit before the graph finishes post-use verification.
    if (!step.dispatchPossible && step.status === 'queued' && !child) {
      pending.push(step.id);
    } else if (step.dispatchPossible && step.status === 'completed'
      && child?.dispatchPossible && child.status === 'completed' && child.exitCode === 0 && child.output === 'complete') {
      completed.push(step.id);
      retained.push(child);
    } else return;
  }
  const batches = DAGResolver.resolve(job.definition.steps.map(step => ({ id: step.id, name: step.id, dependencies: step.needs, status: 'pending' })));
  if (!batches.isValid) return;
  let incompleteBatch = false;
  for (const batch of batches.executionBatches) {
    if (incompleteBatch && batch.some(id => completed.includes(id))) return;
    incompleteBatch ||= batch.some(id => pending.includes(id));
  }
  return { completed, pending, evidence: createHash('sha256').update(JSON.stringify(retained)).digest('hex') };
}
