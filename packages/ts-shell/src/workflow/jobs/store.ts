import { randomUUID } from 'node:crypto';
import type { Session } from '../../session/schema/sessionRecord.js';
import { readBoundSessionState, publishBoundSessionState, type BoundSessionHost, type BoundSessionScope } from '../../session/store/bound.js';
import { sameValue } from '../../config/values.js';
import { validateWorkspace } from '../../runtime/execution/ssh/validation.js';
import { decodeJournal, jobDigest, validateOrigin } from './codec.js';
import { JobStateError, type JobJournal, type JobOrigin, type RemoteJob, type RemoteWorkspace } from './model.js';
import { reservedLocalBytes } from './local/capacity.js';
import { reservedAgentBytes } from './agent/capacity.js';
export { JobStateError } from './model.js';

export class JobStore {
  constructor(private readonly manager: BoundSessionHost, private readonly session: () => Session) {}
  read(): JobJournal { const bound = readBoundSessionState(this.manager, this.session()); return decodeJournal(bound.state.jobs, bound.scope); }
  scope(): BoundSessionScope { return readBoundSessionState(this.manager, this.session()).scope; }
  connect(remote: RemoteWorkspace): JobJournal {
    validateWorkspace(remote); return this.update((current, scope) => ({ ...current, scope, remote }));
  }
  disconnect(): JobJournal { return this.update((current, scope) => ({ ...current, scope, remote: undefined })); }
  create(command: string, origin: JobOrigin): RemoteJob {
    validateOrigin(origin); const id = randomUUID();
    const saved = this.update((current, scope) => {
      if (!current.remote) throw new JobStateError('unavailable');
      if (!sameValue(current.scope, scope)) throw new JobStateError('detached');
      if (typeof command !== 'string' || Buffer.byteLength(command) > 16384 || !command.trim() || command.includes('\0')) throw new JobStateError('invalid');
      if (current.jobs.length + (current.local?.length ?? 0) + (current.agents?.length ?? 0) >= 128 || current.jobs.filter(job => ['queued', 'running', 'unknown'].includes(job.status)).length >= 2) throw new JobStateError('capacity');
      const intent = { id, command, binding: current.remote, scope, origin, lifetime: origin.kind === 'local' ? 'detached' as const : 'parent' as const };
      const job: RemoteJob = { ...intent, digest: jobDigest(intent), backend: 'ssh', createdAt: Date.now(), status: 'queued',
        dispatchPossible: false, output: 'pending', note: 'Approved queued intent; no remote command was sent.' };
      return { ...current, jobs: [...current.jobs, job] };
    }); return saved.jobs.find(job => job.id === id)!;
  }
  get(id: string): RemoteJob { const job = this.read().jobs.find(value => value.id === id); if (!job) throw new JobStateError('unavailable'); return job; }
  change(id: string, expected: RemoteJob, change: Partial<Omit<RemoteJob, 'id' | 'scope' | 'binding' | 'origin' | 'digest' | 'command' | 'backend' | 'createdAt' | 'lifetime'>>): RemoteJob {
    const saved = this.update((current, scope) => {
      const selected = current.jobs.find(job => job.id === id);
      if (selected && !sameValue(selected.scope, scope)) throw new JobStateError('detached');
      if (!selected || !sameValue(selected, expected) || selected.dispatchPossible && change.dispatchPossible === false
        || selected.invocationId !== undefined && 'invocationId' in change && selected.invocationId !== change.invocationId) throw new JobStateError('conflict');
      return { ...current, jobs: current.jobs.map(job => job.id === id ? { ...job, ...change } : job) };
    }); return saved.jobs.find(job => job.id === id)!;
  }
  update(change: (current: JobJournal, scope: BoundSessionScope) => JobJournal): JobJournal {
    const session = this.session(); const baseline = readBoundSessionState(this.manager, session);
    const current = decodeJournal(baseline.state.jobs, baseline.scope);
    const next = { ...change(current, baseline.scope), version: 1 as const, revision: current.revision + 1 };
    if (next.jobs.length + (next.local?.length ?? 0) + (next.agents?.length ?? 0) > 128
      || Buffer.byteLength(JSON.stringify(next)) + reservedLocalBytes(next) + reservedAgentBytes(next) > 1024 * 1024) throw new JobStateError('capacity');
    decodeJournal(next, baseline.scope);
    const saved = publishBoundSessionState(this.manager, session, baseline, (latest, prior) => sameValue(latest.jobs, prior.jobs),
      latest => ({ ...latest, jobs: next }));
    return decodeJournal(saved.state.jobs, saved.scope);
  }
}
