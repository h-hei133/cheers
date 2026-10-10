import { randomUUID } from 'node:crypto';
import { sameValue } from '../../../config/values.js';
import type { CommandExecutionResult } from '../../../runtime/execution/types.js';
import { JobStore } from '../store.js';
import { JobStateError, type JobOrigin, type LocalJob } from '../model.js';
import { validateOrigin } from '../validation.js';
import { localDigest } from './codec.js';
import { captureWorkspaceRoot } from '../../../core/workspace/roots.js';
import { verifyPathContainment } from '../../../core/security/pathJail.js';
import type { BackgroundInput, LocalJournalPort } from './model.js';
export class LocalJournal implements LocalJournalPort {
  readonly ownerId = randomUUID();
  private readonly admissions = new Map<string, () => string | undefined>();
  constructor(readonly store: JobStore, private readonly origin: () => JobOrigin,
    private readonly captureAdmission: () => () => string | undefined) {}
  create(input: BackgroundInput, reserved?: { readonly id: string; readonly origin: JobOrigin }): string {
    const admission = this.captureAdmission(); if (admission()) throw new JobStateError('unavailable');
    const id = reserved?.id ?? randomUUID(); const origin = reserved?.origin ?? this.origin(); validateOrigin(origin);
    if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)) throw new JobStateError('invalid');
    const timeoutMs = input.timeoutMs ?? 300000;
    const root = this.store.scope().workspace.path;
    const captured = captureWorkspaceRoot(input.cwd, root, 'read');
    if (!verifyPathContainment(captured.path, root).allowed) throw new JobStateError('detached');
    const directory = { path: captured.path, identity: captured.identity };
    this.store.update((current, scope) => {
      const local = current.local ?? [];
      if ([...current.jobs, ...local, ...current.agents ?? [], ...current.dags ?? []].some(job => job.id === id)) throw new JobStateError('conflict');
      if (current.jobs.length + local.length + (current.agents?.length ?? 0) + (current.dags?.length ?? 0) >= 128 || local.filter(job => ['queued', 'running', 'paused', 'unknown'].includes(job.status)).length >= 2)
        throw new JobStateError('capacity');
      const intent = { id, ownerId: this.ownerId, command: input.command, directory, timeoutMs, origin, scope, createdAt: Date.now() };
      const job: LocalJob = { ...intent, backend: 'local', digest: localDigest(intent), status: 'queued', dispatchPossible: false,
        stdout: '', stderr: '', truncated: false, output: 'pending', note: 'Approved local intent; no command has been dispatched.' };
      return { ...current, scope, local: [...local, job] };
    }); this.admissions.set(id, admission); return id;
  }
  arm(id: string): void {
    if (this.admission(id)) throw new JobStateError('unavailable');
    const job = this.get(id); if (job.dispatchPossible || job.status !== 'queued') throw new JobStateError('conflict');
    this.change(job, { dispatchPossible: true, status: 'unknown', output: 'unknown', note: 'Local dispatch may occur; this ID is never replayed.' });
  }
  started(id: string): void {
    if (this.admission(id)) throw new JobStateError('unavailable');
    this.change(this.get(id), { status: 'running', note: 'The native execution owner observed the newly spawned process.' });
  }
  output(id: string, stream: 'stdout' | 'stderr', chunk: Buffer): void {
    if (this.admission(id)) throw new JobStateError('unavailable');
    const job = this.get(id); const old = Buffer.from(job[stream], 'base64');
    if (old.length >= 65536 && job.truncated) return;
    const bytes = Buffer.concat([old, chunk.subarray(0, Math.max(0, 65536 - old.length))]);
    this.change(job, { [stream]: bytes.toString('base64'), truncated: job.truncated || chunk.length > 65536 - old.length });
  }
  finish(id: string, result: CommandExecutionResult): void {
    const job = this.get(id);
    const unknown = result.terminationFailed === true;
    const status = unknown ? 'unknown' : result.status === 'completed' && result.exitCode === 0 ? 'completed'
      : result.status === 'cancelled' ? 'cancelled' : 'failed';
    this.change(job, { status, exitCode: result.exitCode !== null && result.exitCode >= 0 ? result.exitCode : undefined,
      output: unknown || result.outputFailed ? 'unknown' : result.status === 'cancelled' || result.status === 'timeout' ? 'interrupted' : 'complete',
      note: unknown ? 'Native process cleanup remains unverified; this job cannot be replayed.'
        : `Native command ${result.status}; retained output ${result.outputFailed ? 'unverified' : job.truncated ? 'truncated' : 'complete'}.` });
    this.admissions.delete(id);
  }
  admission(id: string): string | undefined {
    try {
      const check = this.admissions.get(id); const job = this.get(id);
      const cwd = captureWorkspaceRoot(job.directory.path, job.directory.path, 'read');
      return !check || job.ownerId !== this.ownerId || !sameValue(job.scope, this.store.scope())
        || cwd.path !== job.directory.path || cwd.identity !== job.directory.identity
        ? 'Local job has no current bound runtime owner.' : check();
    } catch { return 'Local job authority or journal is unavailable.'; }
  }
  get(id: string): LocalJob {
    const job = this.store.read().local?.find(value => value.id === id); if (!job) throw new JobStateError('unavailable'); return job;
  }
  list(): readonly LocalJob[] { return this.store.read().local ?? []; }
  unverified(id: string): void {
    this.change(this.get(id), { status: 'unknown', output: 'unknown', note: 'Native settlement or output publication is unavailable; no replay is permitted.' });
    this.admissions.delete(id);
  }
  cancelIntent(id: string): void {
    const job = this.get(id); if (job.dispatchPossible || !['queued', 'paused'].includes(job.status)) throw new JobStateError('conflict');
    this.change(job, { status: 'cancelled', output: 'interrupted', note: 'Undispatched intent cancelled; no process was launched.' });
    this.admissions.delete(id);
  }
  pause(id: string): void {
    const job = this.get(id); if (job.dispatchPossible || job.status !== 'queued') throw new JobStateError('conflict');
    this.change(job, { status: 'paused', note: 'Undispatched command paused; no operating-system process was frozen.' });
  }
  adopt(id: string): LocalJob {
    const admission = this.captureAdmission(); if (admission()) throw new JobStateError('unavailable');
    const expected = this.get(id);
    if (expected.dispatchPossible || !['queued', 'paused'].includes(expected.status)) throw new JobStateError('conflict');
    let selected!: LocalJob;
    this.store.update((current, scope) => {
      if (current.dags?.some(job => job.steps.some(step => step.jobId === id))) throw new JobStateError('conflict');
      if (!sameValue(expected.scope, scope) || !sameValue(current.local?.find(job => job.id === id), expected)) throw new JobStateError('detached');
      const next = { ...expected, ownerId: this.ownerId, status: 'queued' as const, note: 'Fresh exact approval bound this undispatched command to the live owner.' };
      selected = { ...next, digest: localDigest(next) };
      return { ...current, local: current.local!.map(job => job.id === id ? selected : job) };
    }); this.admissions.set(id, admission); return selected;
  }
  private change(expected: LocalJob, changes: Partial<Pick<LocalJob, 'status' | 'dispatchPossible' | 'stdout' | 'stderr' | 'truncated' | 'exitCode' | 'output' | 'note'>>): void {
    this.store.update((current, scope) => {
      const selected = current.local?.find(job => job.id === expected.id);
      if (!selected || !sameValue(selected.scope, scope)) throw new JobStateError('detached');
      if (!sameValue(selected, expected) || selected.ownerId !== this.ownerId || selected.dispatchPossible && changes.dispatchPossible === false)
        throw new JobStateError('conflict');
      return { ...current, local: current.local!.map(job => job.id === expected.id ? { ...job, ...changes } : job) };
    });
  }
}
