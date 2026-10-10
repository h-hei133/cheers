import type { ToolExecutionContext } from '../../tools/types.js';
import type { JobOrigin, RemoteJob } from '../../workflow/jobs/model.js';
import type { SshComposition } from './model.js';
import { operationAdmission, sshAuthority } from './authority.js';
import { jobResult } from './projection.js';

interface ParentJob { readonly release: () => Promise<RemoteJob | undefined>; }
const parents = new WeakMap<SshComposition, Map<string, ParentJob>>();

/** Only the exact local transport is aborted when its ordinary admission changes. */
export async function admittedOperation<T>(admission: () => string | undefined, signal: AbortSignal | undefined,
  execute: (signal: AbortSignal) => Promise<T>, host?: SshComposition): Promise<T> {
  const controller = new AbortController(); const abort = () => controller.abort();
  const check = () => { if (admission()) abort(); };
  signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
  const timer = setInterval(check, 100); timer.unref();
  let drained!: () => void; const settlement = new Promise<void>(resolve => { drained = resolve; });
  host?.operations.set(controller, settlement);
  try { check(); controller.signal.throwIfAborted(); return await execute(controller.signal); }
  finally { clearInterval(timer); signal?.removeEventListener('abort', abort); host?.operations.delete(controller); drained(); }
}

export function cancelLocalOperations(host: SshComposition): void {
  host.cancellationRevision++; host.pending?.abort(); for (const operation of host.operations.keys()) operation.abort();
}

export function lifetimePreview(origin: JobOrigin): string {
  return origin.kind === 'local'
    ? 'This detached job may continue after local disconnect, cancellation or exit; use an independently approved /ssh cancel to stop it.'
    : 'Approval also permits cancellation of this exact job when its parent goal or collaboration authority ends, or this runtime disconnects/exits. Cancellation is attempted once while this runtime retains its bound profile; loss or restart may leave the remote job unknown. No cancellation authority is recreated on restart.';
}

export async function submitJob(host: SshComposition, command: string, origin: JobOrigin, context: ToolExecutionContext) {
  if (host.closing) throw new Error('SSH binding is closing.');
  const pending = Promise.resolve().then(() => performSubmission(host, command, origin, context));
  host.submissions.add(pending);
  try { return await pending; } finally { host.submissions.delete(pending); }
}

async function performSubmission(host: SshComposition, command: string, origin: JobOrigin, context: ToolExecutionContext) {
  const service = host.service; if (!service) throw new Error('SSH unavailable.');
  const parentAdmission = operationAdmission(host, true, true, false);
  const cancelAdmission = operationAdmission(host, true, false, false);
  const cancelService = service.withAdmission(cancelAdmission);
  const admission = operationAdmission(host);
  const job = await admittedOperation(admission, context.abortSignal,
    signal => service.withAdmission(admission).run(command, origin, sshAuthority, signal), host);
  if (job.lifetime === 'parent' && ['running', 'unknown'].includes(job.status)) {
    let entries = parents.get(host); if (!entries) { entries = new Map(); parents.set(host, entries); }
    let settled: Promise<RemoteJob | undefined> | undefined;
    const release = (): Promise<RemoteJob | undefined> => {
      if (settled) return settled;
      clearInterval(timer);
      // The cancellation capability can only call cancel for this approved ID. It cannot submit or replay work.
      context.abortSignal?.removeEventListener('abort', released);
      settled = admittedOperation(cancelAdmission, undefined, signal => cancelService.cancel(job.id, sshAuthority, signal), host)
        .catch(() => recordCancellationUnknown(host, job))
        .then(result => { if (!result || result.status === 'unknown') {
          try { host.report?.(`SSH parent cancellation is unconfirmed for job ${job.id}; retained remote dispatch may still run. Reconcile or cancel explicitly after restoring authority.`); } catch { /* Reporting cannot change remote evidence. */ }
        } return result; })
        .finally(() => { if (!host.closing) entries!.delete(job.id); }); return settled;
    };
    const check = () => {
      try {
        const current = host.jobs.get(job.id);
        if (['completed', 'failed', 'cancelled'].includes(current.status)) {
          clearInterval(timer); context.abortSignal?.removeEventListener('abort', released); entries!.delete(job.id);
        }
        else if (parentAdmission()) void release();
      } catch { void release(); }
    };
    const released = () => { void release(); };
    const timer = setInterval(check, 100); timer.unref(); entries.set(job.id, { release });
    context.abortSignal?.addEventListener('abort', released, { once: true });
    if (context.abortSignal?.aborted) released(); else check();
  }
  return jobResult(job);
}

export async function releaseParentJobs(host: SshComposition): Promise<string> {
  const closing = host.closing; host.closing = true;
  try {
    await Promise.allSettled([...host.submissions]);
    await Promise.allSettled([...host.operations.values()]);
    const selected = [...parents.get(host)?.values() ?? []];
    const results = await Promise.allSettled(selected.map(parent => parent.release()));
    parents.get(host)?.clear();
    const known = results.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : []);
    const cancelled = known.filter(job => job.cancellation === 'selected-cgroup-empty').length;
    const terminal = known.filter(job => ['completed', 'failed', 'cancelled'].includes(job.status)).length;
    return `Parent job cancellation attempts ${selected.length}; selected cgroups confirmed empty ${cancelled}; terminal observations ${terminal}; outcomes unknown ${selected.length - terminal}.`;
  } finally { host.closing = closing; }
}

function recordCancellationUnknown(host: SshComposition, original: RemoteJob): RemoteJob | undefined {
  try {
    const current = host.jobs.get(original.id); if (current.digest !== original.digest) return undefined;
    if (['completed', 'failed', 'cancelled'].includes(current.status)) return current;
    return host.jobs.change(current.id, current, { status: 'unknown', output: 'unknown', cancellation: 'requested',
      note: 'Approved parent cancellation could not establish remote termination; restored authority and explicit reconciliation are required.' });
  } catch { return undefined; }
}
