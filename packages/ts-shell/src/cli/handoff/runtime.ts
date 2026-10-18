import { randomUUID } from 'node:crypto';
import { sameValue } from '../../config/values.js';
import { captureWorkspaceRoot } from '../../core/workspace/roots.js';
import type { AgentLifecycleEvent } from '../../core/agent/events.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import type { SessionManager } from '../../session/SessionManager.js';
import type { Session } from '../../session/schema/sessionRecord.js';
import { readBoundSessionState } from '../../session/store/bound.js';
import type { StepControlFactory } from '../../turn/control.js';
import type { CompactionSetup } from '../../turn/session.js';
import type { CacheWarmingRunner } from '../../turn/cacheWarm.js';
import type { StepFunction } from '../../turn/step.js';
import type { Handoff } from '../../workflow/handoff/model.js';
import { HandoffStore } from '../../workflow/handoff/store.js';
import { handoffPolicy } from '../../workflow/handoff/policy.js';
import type { RequestPolicy } from '../../core/agent/request/model.js';
import { resolveContextWindow, resolveTokenBudget } from '../../core/models/window.js';
import { DEFAULT_RESERVE_TOKENS } from '../../session/context.js';
import { armedHandoffs, liveHandoffs } from './state.js';
import { resolveProviderCredential } from '../../core/shell/providerCredentials.js';

export class HandoffRun {
  private row: Handoff;
  private readonly session: Session;
  private readonly store: HandoffStore;
  private readonly mode: 'plan' | 'build';
  private readonly permission: ReturnType<ShellSessionRuntime['getPermissionScope']>;
  private readonly toolResults = new Map<string, { readonly name: string; readonly success: boolean }>();
  private checklist = false;
  private trigger?: string;
  private uncertain = false;
  constructor(private readonly context: ShellRuntimeContext, private readonly manager: SessionManager,
    private readonly runtime: ShellSessionRuntime, row: Handoff, readonly signal: AbortSignal,
    private readonly parentAdmission: () => string | undefined, private readonly notice: (message: string) => void) {
    this.row = row; this.session = context.session; this.store = new HandoffStore(manager, this.session);
    this.mode = runtime.getAgentMode(); this.permission = runtime.getPermissionScope();
  }
  get id(): string { return this.row.id; }
  get contextText(): string {
    return `One-turn model handoff ${this.id}: ${this.row.source.model} plans first. Keep a nonempty session todo checklist. After the first independently authorized successful edit, write or patch, subsequent requests use ${this.row.target.model}. Preserve the user's original constraints and input order. This model selection grants no tool or file authority.`;
  }
  admission = (): string | undefined => {
    const refused = this.parentAdmission(); if (refused) return refused;
    if (this.signal.aborted || this.context.session.id !== this.session.id || this.context.session.createdAt !== this.session.createdAt
      || this.runtime.getAgentMode() !== this.mode || this.runtime.getPermissionScope() !== this.permission) return 'The handoff session, permission or mode changed.';
    try {
      const bound = readBoundSessionState(this.manager, this.session);
      const directory = captureWorkspaceRoot(this.context.cwd, this.context.cwd, 'read');
      const current = this.store.read().cycles.find(row => row.id === this.id);
      return sameValue(bound.scope, this.row.scope) && bound.state.modelRevision === this.row.modelRevision
        && directory.path === this.row.directory.path && directory.identity === this.row.directory.identity && sameValue(current, this.row)
        ? undefined : 'The handoff selection, directory or session model changed.';
    } catch { return 'The handoff binding is unavailable.'; }
  };
  accept(): void {
    this.assert();
    const bound = readBoundSessionState(this.manager, this.session);
    this.row = this.store.change(this.row, { phase: 'running', runId: randomUUID(),
      ...(bound.state.pendingPromptEntryId ? { promptEntryId: bound.state.pendingPromptEntryId } : {}) });
    armedHandoffs.delete(this.context);
  }
  policy(policy: RequestPolicy | undefined): RequestPolicy | undefined { return handoffPolicy(policy, this.id, () => this.row.phase === 'switched'); }
  resources<T extends { readonly compaction?: CompactionSetup; readonly cacheWarming?: CacheWarmingRunner }>(resources: T): T {
    resources.cacheWarming?.stop();
    const { config, catalog } = this.context.configuration.current;
    const target = this.row.target;
    const current = this.context.resolveConfigTarget?.(config) ?? resolveProviderCredential({ runtimeConfig: config });
    const window = resolveContextWindow({ catalog, provider: target.provider, model: target.model, baseUrl: current.baseUrl, configured: config.contextWindow }).window;
    const reserve = resolveTokenBudget(config.modelTokenBudgets, target.provider, target.model, 'reserveTokens', config.reserveTokens, DEFAULT_RESERVE_TOKENS);
    return { ...resources, cacheWarming: undefined, ...(resources.compaction ? { compaction: { ...resources.compaction,
      policy: { ...resources.compaction.policy, contextWindow: Math.min(window, resources.compaction.policy.contextWindow),
        reserveTokens: Math.max(reserve, resources.compaction.policy.reserveTokens ?? DEFAULT_RESERVE_TOKENS) } } } : {}) };
  }
  control: StepControlFactory = host => {
    this.assert();
    if (!host.tools.has('todo')) throw new Error('Model handoff requires the session checklist tool.');
    let active: StepFunction = host.step;
    const target = host.forModel(this.row.target.model, this.admission, this.row.target.thinkingEffort, 'current');
    return { step: async (...args) => {
      this.assert(); if (!this.row.runId) throw new Error('The handoff turn has not been accepted.');
      return active(...args);
    }, observe: async (event, signal) => {
      this.observe(event);
      if (event.type !== 'turn_end' || signal.aborted
        || event.message.stopReason === 'error' || event.message.stopReason === 'aborted') return;
      if (this.uncertain) throw new Error('Model handoff stopped because a mutation result is unverified. Inspect its operation receipt before continuing.');
      if (!this.trigger || this.row.phase !== 'running') return;
      try {
        this.assert();
        const change = { sessionId: this.session.id, workspaceRoot: this.context.cwd, timestamp: new Date().toISOString(),
          fromModel: this.row.source.model, toModel: this.row.target.model };
        const before = await host.hooks.dispatch({ ...change, eventName: 'PreModelSwitch' });
        if (before.decision === 'block' || before.decision === 'retry') throw new Error('Model handoff blocked by hook policy.');
        this.assert();
        this.row = this.store.change(this.row, { phase: 'switched', switchedBy: this.trigger });
        const after = await host.hooks.dispatch({ ...change, eventName: 'PostModelSwitch' });
        if (after.decision === 'block' || after.decision === 'retry') throw new Error('Model handoff publication was refused by hook policy.');
        this.assert(); active = target;
        this.notice(`Handoff ${this.id}: subsequent requests use ${this.row.target.model}; session preferences remain available for the following turn.`);
      } catch (error) { this.uncertain = true; throw error; }
    } };
  };
  commandSettled(result: { readonly terminationFailed?: boolean; readonly outputFailed?: boolean }): void {
    this.uncertain ||= result.terminationFailed === true || result.outputFailed === true;
  }
  settle(outcome: 'completed' | 'failed' | 'cancelled' | 'unknown'): void {
    try {
      // A finalized tool whose transcript never reached this observer has no durable result proof.
      this.uncertain ||= [...this.toolResults.values()].some(result => ['edit', 'write', 'apply_patch'].includes(result.name));
      const phase = this.uncertain || outcome === 'unknown' ? 'unknown' : outcome === 'failed' ? 'failed' : outcome;
      this.row = this.store.change(this.row, { phase: this.row.phase === 'armed' && phase === 'completed' ? 'failed' : phase, endedAt: Date.now() });
    } catch { this.notice('Model handoff settlement is unverified; inspect /handover status.'); }
    finally { if (liveHandoffs.get(this.context) === this) liveHandoffs.delete(this.context); }
  }
  private assert(): void { const refused = this.admission(); if (refused) throw new Error(refused); }
  private observe(event: AgentLifecycleEvent): void {
    if (event.type === 'tool_execution_end') this.toolResults.set(event.toolCallId, { name: event.toolName, success: !event.isError });
    if (event.type === 'message_end' && event.message.role === 'tool' && event.message.tool_call_id) {
      const result = this.toolResults.get(event.message.tool_call_id); const metadata = event.message.metadata;
      this.toolResults.delete(event.message.tool_call_id);
      const mutation = result && ['edit', 'write', 'apply_patch'].includes(result.name);
      if (mutation && ['unverified', 'pending', 'unknown', 'partial'].includes(String(metadata?.status))) this.uncertain = true;
      if (result?.success && !['unverified', 'pending', 'unknown'].includes(String(metadata?.status))) {
        if (result.name === 'todo' && Array.isArray(metadata?.todo) && metadata.todo.length) this.checklist = true;
        if (mutation && this.checklist && !this.trigger && metadata?.status === 'committed') this.trigger = event.message.tool_call_id;
      }
    }
    if (event.type === 'turn_end') {
      this.uncertain ||= [...this.toolResults.values()].some(result => ['edit', 'write', 'apply_patch'].includes(result.name));
      this.toolResults.clear();
    }
  }
}
