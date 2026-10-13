import { sameValue } from '../../config/values.js';
import type { RuntimeConfig } from '../../config/runtimeConfig.js';
import { captureWorkspaceRoot } from '../../core/workspace/roots.js';
import { readBoundSessionState } from '../../session/store/bound.js';
import { readGoalEdit } from '../../planning/goal/store.js';
import { DirectorStore } from '../../workflow/director/store.js';
import type { Director } from '../../workflow/director/model.js';
import type { AgentJob } from '../../workflow/jobs/agent/model.js';
import type { JobsComposition } from '../jobs/model.js';
import { jobAdmission } from '../jobs/authority.js';
import { sourceChoice } from '../provider/selection.js';
import { liveDirectors } from './state.js';
import type { DirectorOwner } from './model.js';

export const directorTools = ['read', 'glob', 'grep', 'web_search', 'web_fetch', 'todo', 'ask',
  'worker_start', 'worker_send', 'worker_show', 'worker_output', 'worker_wait', 'worker_stop'] as const;

export class DirectorRuntime implements DirectorOwner {
  private current: Director;
  private readonly store: DirectorStore;
  private readonly parentAdmission: () => string | undefined;
  private readonly mode: 'plan' | 'build';
  private readonly permission: ReturnType<JobsComposition['runtime']['getPermissionScope']>;
  private closing?: Promise<string>;
  private revoked = false;
  constructor(readonly host: JobsComposition, row: Director) {
    this.current = row; this.store = new DirectorStore(host.manager, host.session);
    this.parentAdmission = jobAdmission(host, 'task'); this.mode = host.runtime.getAgentMode(); this.permission = host.runtime.getPermissionScope();
  }
  get row(): Director { return this.current; }
  admission = (): string | undefined => {
    if (this.revoked || liveDirectors.get(this.host.context) !== this) return 'The director selection was revoked.';
    const refused = this.parentAdmission(); if (refused) return refused;
    try {
      const { host } = this; const bound = readBoundSessionState(host.manager, host.session);
      const directory = captureWorkspaceRoot(host.context.cwd, host.context.cwd, 'read');
      const resolution = host.agentRuntimeInput?.providerRuntimeBridge.resolveCredentialSnapshot();
      const active = this.store.read().cycles.find(row => row.id === this.row.id);
      return resolution && sameValue(sourceChoice(host.context.cwd, resolution), this.row.source)
        && sameValue(bound.scope, this.row.scope) && bound.state.modelRevision === this.row.modelRevision
        && directory.path === this.row.directory.path && directory.identity === this.row.directory.identity
        && sameValue(active, this.row) && active?.phase === 'enabled' && host.runtime.getAgentMode() === this.mode
        && host.runtime.getPermissionScope() === this.permission && readGoalEdit(host.manager, host.session).goal?.phase !== 'active'
        ? undefined : 'The director session, model, directory, mode or permission changed.';
    } catch { return 'The director binding is unavailable.'; }
  };
  config = (original: RuntimeConfig): RuntimeConfig => ({ ...original,
    allowedTools: directorTools.filter(name => original.allowedTools === undefined || original.allowedTools.includes(name)) });
  reserved = (job: AgentJob): void => {
    const refused = this.admission(); if (refused) throw new Error(refused);
    if (!sameValue(job.scope, this.row.scope) || job.status !== 'unknown' || job.child !== undefined
      || this.row.workers.includes(job.id)) throw new Error('The reserved worker identity changed.');
    this.current = this.store.change(this.row, { workers: [...this.row.workers, job.id] });
    const changed = this.admission(); if (changed) throw new Error(changed);
  };
  close = (): Promise<string> => {
    if (this.closing) return this.closing;
    this.revoked = true;
    if (liveDirectors.get(this.host.context) === this) liveDirectors.delete(this.host.context);
    this.host.runtime.getCurrentRunController()?.abort();
    this.closing = this.cleanup(); return this.closing;
  };
  private async cleanup(): Promise<string> {
    let publicationUnknown = false;
    try { this.current = this.store.change(this.row, { phase: 'stopping' }); }
    catch { publicationUnknown = true; }
    const results = await Promise.allSettled(this.row.workers.map(async id => {
      const job = this.host.agents.journal.get(id);
      if (this.host.agents.hasLive(id) || job.runs.length === 0 && ['queued', 'paused'].includes(job.status))
        return this.host.agents.stop(job);
      return !['running', 'unknown'].includes(job.status);
    }));
    const unknown = publicationUnknown || results.some(result => result.status === 'rejected' || !result.value);
    try {
      this.current = this.store.change(this.row, { phase: unknown ? 'unknown' : 'disabled',
        endedAt: Math.max(this.row.createdAt, Date.now()), ...(unknown ? { retired: true } : {}) });
      return unknown ? 'Director off; worker cleanup or prior outcomes remain unknown. Retained jobs are not replayed.'
        : 'Director off; exact worker cleanup settled. Ordinary model preferences and tools are available for the next turn.';
    } catch { return 'Director revoked; state publication or cleanup is unverified. Inspect /director status and /jobs.'; }
  }
}
