import type { BoundSessionHost } from '../../session/store/bound.js';
import type { Session } from '../../session/schema/sessionRecord.js';
import type { RequestPolicy } from '../../core/agent/request/model.js';
import type { ToolExecutionContext } from '../../tools/types.js';
import { createProcessOwner, processOwnerDisposition } from '../../core/state/owner.js';
import type { ResearchRequest } from '../brief/model.js';
import { safeText } from '../evidence/producer.js';
import { researchReportProjection } from '../report/renderer.js';
import { researchReportDigest } from './prompts.js';
import { currentResearch, readResearch, replaceResearch, writeResearch } from './store.js';
import { boundRun, runEvent, updateRun, type RunBinding } from './state.js';
import { researchLedger, researchRequestPolicy } from './policy.js';
import { runResearchChild } from './child.js';
import type { ResearchRun } from './model.js';
import { recoverResearchSave } from '../report/recovery.js';
import { prepareResearchRun } from './preparation.js';

export interface ResearchHost {
  readonly store: BoundSessionHost;
  readonly current: () => Session;
  readonly report: (message: string) => void;
}
interface ArmedRun extends RunBinding { readonly epoch: number }

export class ResearchRuntime {
  private armed?: ArmedRun;
  private active?: { readonly binding: RunBinding; readonly abort: AbortController };
  private activation?: Session;
  constructor(readonly host: ResearchHost) {}

  current(): ResearchRun | undefined {
    this.recover(); return currentResearch(readResearch(this.host.store, this.host.current()));
  }
  binding(): RunBinding {
    const run = this.current();
    if (!run) throw new Error('No research run is bound to this session.');
    return { host: this.host.store, session: this.host.current(), id: run.id };
  }
  create(request: ResearchRequest): ResearchRun {
    this.recover();
    const session = this.host.current(); const edit = readResearch(this.host.store, session);
    if (this.active || currentResearch(edit)?.pending || currentResearch(edit)?.owner) throw new Error('Research has a pending owner or child outcome; pause and reconcile it before new work.');
    const run = prepareResearchRun({ scope: edit.bound.scope, goal: edit.bound.state.goal }, request);
    writeResearch(this.host.store, session, edit, replaceResearch(edit, run), undefined, run.goal ? undefined : run.id);
    this.arm(run); return run;
  }
  arm(run: ResearchRun): void {
    this.armed = { host: this.host.store, session: this.host.current(), id: run.id, epoch: run.epoch };
  }
  selected(runId: unknown): ResearchRun | undefined {
    if (typeof runId !== 'string' || this.armed?.id !== runId || this.armed.session !== this.host.current()) return undefined;
    const run = boundRun(this.armed);
    return run.epoch === this.armed.epoch ? run : undefined;
  }
  policy(runId: unknown, inherited?: RequestPolicy): RequestPolicy | undefined {
    const run = this.selected(runId);
    return run ? researchRequestPolicy(this.host.store, this.armed!.session, run, this.host.current, inherited) : undefined;
  }
  async run(runId: string, context: ToolExecutionContext): Promise<ResearchRun> {
    const selected = this.selected(runId);
    if (!selected || selected.status !== 'ready' || selected.pending || selected.owner || !context.runSubagent || this.active
      || context.sessionId !== selected.sessionId || context.workspaceRoot !== selected.workspace.path) throw new Error('The armed research run cannot admit a child.');
    const binding = this.armed!; const abort = new AbortController();
    const owner = createProcessOwner();
    this.active = { binding, abort };
    const cancel = () => abort.abort(); context.abortSignal?.addEventListener('abort', cancel, { once: true });
    if (context.abortSignal?.aborted) cancel();
    const timer = setTimeout(cancel, Math.max(0, Date.parse(selected.deadlineAt) - Date.now()));
    try {
      let run = updateRun(binding, value => ({ ...value, owner }));
      while (['ready', 'running'].includes(run.status) && !abort.signal.aborted) {
        run = await runResearchChild(binding, context.runSubagent, abort.signal, this.host.report);
      }
      if (abort.signal.aborted && ['ready', 'running'].includes(run.status)) run = updateRun(binding, value => runEvent({ ...value,
        status: 'paused', epoch: value.epoch + 1, stopReason: 'Research cancelled or deadline reached.' }, 'stopped', 'Research cancelled or deadline reached.'));
      return run;
    } finally {
      clearTimeout(timer); context.abortSignal?.removeEventListener('abort', cancel); this.active = undefined;
      updateRun(binding, value => value.owner?.token === owner.token && !value.pending ? { ...value, owner: undefined } : value);
    }
  }
  pause(): ResearchRun {
    const binding = this.binding();
    const run = updateRun(binding, value => runEvent({ ...value, status: 'paused', epoch: value.epoch + 1,
      stopReason: value.pending ? 'Pause requested; local child cancellation is pending. Remote request outcome remains in the ledger.' : 'Research paused.' }, 'paused', 'User pause'));
    this.active?.abort.abort(); this.armed = undefined; return run;
  }
  resume(): ResearchRun {
    const binding = this.binding(); const previous = boundRun(binding);
    if (this.active || previous.pending || previous.owner) throw new Error('Pending owner/child output requires explicit /deep-research reconcile discard; it is never replayed automatically.');
    const ledger = researchLedger(this.host.store, binding.session, previous);
    if ((ledger.unknown || ledger.historyUnknown) && previous.reconciledUnknown !== ledger.unknownDigest) throw new Error('Unknown request outcomes require explicit /deep-research reconcile discard. The ledger and cap consequences will be retained.');
    if (Date.now() >= Date.parse(previous.deadlineAt)) throw new Error('The retained research deadline has expired. Start a new run explicitly.');
    if (previous.status === 'completed') throw new Error('Research already completed; inspect or save its existing report.');
    const run = updateRun(binding, value => runEvent({ ...value, status: 'ready', epoch: value.epoch + 1, stopReason: undefined,
      ...(value.brief && value.claims.length ? { stage: 'reconcile', resumeStage: value.stage === 'reconcile' ? value.resumeStage : value.stage } : {}) }, 'resumed', 'Explicit resume; retained cited sources must be re-read.'));
    this.arm(run); return run;
  }
  steer(question: string): ResearchRun {
    const binding = this.binding(); const previous = boundRun(binding);
    if (this.active || previous.pending || previous.owner || Date.now() >= Date.parse(previous.deadlineAt)) throw new Error('Pause and settle/reconcile research before steering; its original deadline remains.');
    const ledger = researchLedger(this.host.store, binding.session, previous);
    if ((ledger.unknown || ledger.historyUnknown) && previous.reconciledUnknown !== ledger.unknownDigest) throw new Error('Unknown request outcomes require explicit reconciliation before steering.');
    const run = updateRun(binding, value => runEvent({ ...value, epoch: value.epoch + 1, briefRevision: value.briefRevision + 1,
      request: { ...value.request, question: safeText(question, 8000) }, brief: undefined, briefInput: undefined, status: 'ready', stage: 'brief',
      claims: [], draft: undefined, review: undefined, fragments: [], gapQuestions: [], investigationRounds: 0, stopReason: undefined }, 'steered', question));
    this.arm(run); return run;
  }
  discard(): ResearchRun {
    const binding = this.binding(); const previous = boundRun(binding);
    if (this.active || previous.pending && processOwnerDisposition(previous.pending.owner) !== 'dead'
      || previous.owner && processOwnerDisposition(previous.owner) !== 'dead') throw new Error('A live or unknown child owner cannot be discarded. Pause and wait for its local outcome.');
    const ledger = researchLedger(this.host.store, binding.session, previous);
    return updateRun(binding, value => runEvent({ ...value, status: 'paused', epoch: value.epoch + 1, pending: undefined, owner: undefined,
      children: value.children.map(child => child.status === 'running' ? { ...child, status: 'unknown' as const } : child),
      reconciledUnknown: ledger.unknownDigest, stopReason: 'Unknown child output discarded explicitly. Unknown request ledger entries and budget consequences are retained; resume performs source reconciliation.' }, 'stopped', 'Explicit reconciliation discards output only.'));
  }
  recover(): void {
    const session = this.host.current();
    if (this.activation === session) return;
    this.activation = session; this.armed = undefined;
    const run = currentResearch(readResearch(this.host.store, session));
    if (run && recoverResearchSave({ host: this.host.store, session, id: run.id }, run)) return;
    if (!run || !['ready', 'running'].includes(run.status)) return;
    const owner = run.owner ?? run.pending?.owner;
    // Read-only inspection cannot revoke a live or unknown owner's authority.
    if (!owner || processOwnerDisposition(owner) !== 'dead') return;
    updateRun({ host: this.host.store, session, id: run.id }, value => runEvent({ ...value, status: 'paused', epoch: value.epoch + 1,
      children: value.children.map(child => child.status === 'running' ? { ...child, status: 'unknown' as const } : child),
      stopReason: 'Proven dead local owner recovery paused research. Pending requests/children and owner identity are retained and are not replayed.' }, 'paused', 'Dead local owner recovery'));
  }
  snapshot(): string {
    return this.reportProjection().text;
  }
  reportProjection(): { readonly text: string; readonly truncated: boolean } {
    const run = this.current(); if (!run) return { text: 'No research run is bound to this session.', truncated: false };
    try { return researchReportProjection(run, researchLedger(this.host.store, this.host.current(), run)); }
    catch { return researchReportProjection(run); }
  }
  saveBinding(runId: string): { binding: RunBinding; run: ResearchRun; digest: string } {
    const run = this.selected(runId);
    if (!run || run.pending || run.owner || !['completed', 'partial'].includes(run.status) || !run.save.requested) throw new Error('Report save requires the current requested, settled research output.');
    if (run.save.status === 'unknown' || run.save.status === 'pending' && run.save.path) throw new Error('Report file outcome is unconfirmed; inspect the original edit operation. Replaying the save is refused.');
    return { binding: this.armed!, run, digest: researchReportDigest(run) };
  }
}
