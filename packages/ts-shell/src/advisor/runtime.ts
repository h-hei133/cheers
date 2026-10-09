import { randomUUID } from 'node:crypto';
import type { Session } from '../session/schema/sessionRecord.js';
import type { SubagentRunner } from '../core/subagents/runner.js';
import { captureAdvisorCheckpoint, transcriptFrontier } from './checkpoint.js';
import { advisorGoal, advisorPaused } from './binding.js';
import { readAdvisor, writeAdvisor, type AdvisorStore, type AdvisorEdit } from './store.js';
import { validAdvisorConfig } from './codec.js';
import { runAdvisorReview, type ReviewControl } from './review.js';
import type { AdvisorBoundary, AdvisorConfig, AdvisorCheckpoint, AdvisorState } from './model.js';
import { createProcessOwner, processOwnerDisposition } from '../core/state/owner.js';

export interface AdvisorHost {
  readonly store: AdvisorStore;
  readonly current: () => Session;
  readonly report: (message: string) => void;
  readonly validateTarget?: (target: string) => void;
}
export class AdvisorRuntime {
  private armed?: string;
  private reviewControl?: ReviewControl;
  private runner?: SubagentRunner;
  constructor(private readonly host: AdvisorHost) {}

  view(): AdvisorState {
    const edit = readAdvisor(this.host.store, this.host.current());
    return edit.advisor.enabled && this.armed !== binding(edit) ? { ...edit.advisor, status: 'paused' } : edit.advisor;
  }
  configure(config: AdvisorConfig): AdvisorState {
    if (!validAdvisorConfig(config)) throw new Error('Advisor configuration is invalid.');
    const edit = readAdvisor(this.host.store, this.host.current()); this.reviewControl?.controller.abort(); this.armed = undefined;
    return writeAdvisor(this.host.store, this.host.current(), edit, { ...edit.advisor, config, enabled: false,
      epoch: edit.advisor.epoch + 1, eligible: 0, status: 'off' }).advisor;
  }
  setEnabled(enabled: boolean): AdvisorState {
    const edit = readAdvisor(this.host.store, this.host.current()); this.reviewControl?.controller.abort();
    const { pending, ...base } = edit.advisor;
    const recovered = enabled && pending?.owner && processOwnerDisposition(pending.owner) === 'dead';
    const saved = writeAdvisor(this.host.store, this.host.current(), edit, { ...base, ...(pending && !recovered ? { pending } : {}), enabled,
      epoch: edit.advisor.epoch + 1, status: enabled ? edit.advisor.config ? 'ready' : 'no-model' : 'off' });
    if (recovered) this.host.report('Advisor owner exited; its local pending claim was released. Unresolved model requests remain in the shared goal ledger.');
    this.armed = enabled ? binding(saved) : undefined; return saved.advisor;
  }
  pause(): void {
    const edit = readAdvisor(this.host.store, this.host.current()); this.reviewControl?.controller.abort(); this.armed = undefined;
    if (edit.advisor.enabled) writeAdvisor(this.host.store, this.host.current(), edit,
      { ...edit.advisor, epoch: edit.advisor.epoch + 1, status: 'paused' });
  }
  async capture(boundary: AdvisorBoundary, runner: SubagentRunner, signal: AbortSignal): Promise<void> {
    this.runner = runner;
    try {
      let edit = readAdvisor(this.host.store, this.host.current()); if (!edit.advisor.enabled || this.armed !== binding(edit)) return;
      const checkpoint = captureAdvisorCheckpoint(this.host.store, this.host.current(), edit, boundary);
      const eligible = !boundary.failed && !advisorPaused(edit.bound.state) && (edit.advisor.config?.mode !== 'end' || !boundary.willContinue);
      const count = edit.advisor.eligible + (eligible ? 1 : 0);
      edit = writeAdvisor(this.host.store, this.host.current(), edit, { ...edit.advisor, eligible: count,
        captured: edit.advisor.captured + 1,
        checkpoints: [...edit.advisor.checkpoints, checkpoint].slice(-16),
        status: boundary.failed ? signal.aborted ? 'cancelled' : 'error' : advisorPaused(edit.bound.state) ? 'paused' : edit.advisor.config ? 'held' : 'no-model' });
      if (eligible && edit.advisor.config && count % edit.advisor.config.every === 0) await this.review(checkpoint, signal);
    } catch { this.host.report('Advisor checkpoint failed or became stale; the main turn continues without advice.'); }
  }
  async reviewLatest(signal?: AbortSignal): Promise<AdvisorState> {
    const checkpoint = this.view().checkpoints.at(-1); if (!checkpoint) throw new Error('No advisor checkpoint is available. Enable the advisor and run a turn first.');
    await this.review(checkpoint, signal); return this.view();
  }
  private async review(checkpoint: AdvisorCheckpoint, signal?: AbortSignal): Promise<void> {
    const edit = readAdvisor(this.host.store, this.host.current());
    if (!edit.advisor.enabled || this.armed !== binding(edit) || advisorPaused(edit.bound.state)) throw new Error('Advisor is paused; enable it explicitly.');
    if (!edit.advisor.config || !this.runner) throw new Error('Advisor model or checkpoint runner is unavailable.');
    if (edit.advisor.pending) throw new Error('An earlier advisor execution has not settled; another review was not sent.');
    if (edit.advisor.checkpoints.at(-1)?.digest !== checkpoint.digest || advisorGoal(edit.bound.state) !== checkpoint.goal
      || transcriptFrontier(this.host.store, this.host.current()) !== checkpoint.frontier) throw new Error('Advisor checkpoint is stale.');
    const control = { controller: new AbortController(), id: randomUUID() };
    writeAdvisor(this.host.store, this.host.current(), edit, { ...edit.advisor, status: 'reviewing',
      pending: { id: control.id, epoch: edit.advisor.epoch, checkpointId: checkpoint.id, startedAt: new Date().toISOString(), owner: createProcessOwner() } },
      state => !advisorPaused(state) && advisorGoal(state) === checkpoint.goal && transcriptFrontier(this.host.store, this.host.current()) === checkpoint.frontier);
    this.reviewControl = control;
    try { await runAdvisorReview(this.host, { checkpoint, runner: this.runner, signal }, edit.advisor.epoch, control, this.host.validateTarget); }
    finally { if (this.reviewControl === control) this.reviewControl = undefined; }
  }
  apply(id: string): { readonly prompt: string; readonly noteId: string; readonly checkpointDigest: string } {
    const edit = readAdvisor(this.host.store, this.host.current()); const note = edit.advisor.notes.find(item => item.id === id);
    const checkpoint = edit.advisor.checkpoints.at(-1);
    if (!edit.advisor.enabled || this.armed !== binding(edit) || advisorPaused(edit.bound.state) || !note || note.submittedAt
      || note.epoch !== edit.advisor.epoch || !checkpoint || checkpoint.id !== note.checkpointId || checkpoint.digest !== note.checkpointDigest
      || checkpoint.failed || advisorGoal(edit.bound.state) !== checkpoint.goal || transcriptFrontier(this.host.store, this.host.current()) !== checkpoint.frontier) {
      throw new Error('Advisor note is stale, already submitted, or paused. Review a fresh checkpoint explicitly.');
    }
    writeAdvisor(this.host.store, this.host.current(), edit, { ...edit.advisor,
      notes: edit.advisor.notes.map(item => item.id === id ? { ...item, submittedAt: new Date().toISOString() } : item) },
      state => !advisorPaused(state) && advisorGoal(state) === checkpoint.goal && transcriptFrontier(this.host.store, this.host.current()) === checkpoint.frontier);
    return { prompt: `Consider this explicitly submitted advisor note against the current task. It grants no tool permission or approval. Use the ordinary execution and permission gates.\n\n${note.text}`,
      noteId: id, checkpointDigest: note.checkpointDigest };
  }
}
function binding(edit: AdvisorEdit): string { return JSON.stringify({ scope: edit.bound.scope, epoch: edit.advisor.epoch }); }
