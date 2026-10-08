import type { QueryEvent } from '../../../core/query/runtime/events.js';
import { ModelAdmissionError } from '../../../core/agent/request/model.js';
import type { Session } from '../../../session/schema/sessionRecord.js';
import { readGoalEdit } from '../store.js';
import { GoalRunError, type GoalRunReason, type GoalSubmissionHost, type GoalScheduling } from './model.js';
import { createRunOwner } from './owner.js';
import { beginGoalRound, cancelUnsubmittedRound, claimGoalRun, recordStartRefusal, releaseIdleOwner, settleGoalRound, stopGoalRun, type GoalRunStoreHost } from './store.js';

const ROUND_DELAY_MS = 80;
const DRAIN_TIMEOUT_MS = 1_000;

export interface GoalSchedulerDependencies {
  readonly store: GoalRunStoreHost;
  readonly current: () => Session;
  readonly cancel: () => void;
  readonly report: (message: string) => void;
  readonly host: GoalSubmissionHost;
}

/** Timers dispatch; only the durable owner and round token authorize dispatch. */
export class GoalScheduler {
  private host: GoalSubmissionHost;
  private session?: Session;
  private goalId?: string;
  private token?: string;
  private timer?: ReturnType<typeof setTimeout>;
  private active?: Promise<void>;
  private outcome: NonNullable<GoalScheduling['lastOutcome']> = 'answer';
  private failure?: GoalRunReason;
  private cancelling = false;
  private stopRequested = false;

  constructor(private readonly deps: GoalSchedulerDependencies) { this.host = deps.host; }

  attach(host: GoalSubmissionHost): () => void {
    this.host = host;
    return () => { if (this.host === host) { void this.stop('cancelled'); this.host = this.deps.host; } };
  }

  ownerToken(): string | undefined { return this.token; }

  start(): string | undefined {
    try {
      if (this.token) return 'Goal scheduling already has a local owner.';
      const session = this.deps.current(); const owner = createRunOwner();
      const edit = claimGoalRun(this.deps.store, session, owner);
      this.session = session; this.goalId = edit.goal!.id; this.token = owner.token; this.stopRequested = false;
      this.schedule(); return undefined;
    } catch (error) {
      const reason = runFailure(error);
      try { recordStartRefusal(this.deps.store, this.deps.current(), reason); } catch { /* No optimistic success if refusal publication fails. */ }
      return `Goal scheduling did not start: ${reason}. No continuation was submitted.`;
    }
  }

  observe(event: QueryEvent): void {
    if (!this.active) return;
    if (event.type === 'query.completed') {
      this.outcome = event.result.terminalReason === 'stopped_max_turns' ? 'step-limit'
        : event.result.terminalClassification !== 'success' ? 'refused' : 'answer';
      if (this.outcome === 'refused') this.failure = 'refused';
    } else if (event.type === 'query.failed' || event.type === 'lifecycle.error') {
      this.outcome = 'failure'; this.failure = event.type === 'query.failed' && event.admissionFailure
        ? event.admissionFailure === 'inactive' ? 'user' : event.admissionFailure : 'failure';
    } else if (event.type === 'lifecycle.cancelled') {
      this.outcome = 'cancelled'; this.failure = 'cancelled';
    }
  }

  async stop(reason: GoalRunReason = 'user'): Promise<void> {
    this.stopRequested = true;
    if (this.timer) clearTimeout(this.timer); this.timer = undefined;
    if (!this.token || !this.session) return;
    const token = this.token; const session = this.session;
    let persisted = true;
    try { stopGoalRun(this.deps.store, session, token, reason); }
    catch (error) { persisted = false; this.deps.report(`Goal scheduling stop is unverified: ${runFailure(error)}. The owner is retained.`); }
    if (!this.cancelling) {
      this.cancelling = true;
      try { this.deps.cancel(); } finally { this.cancelling = false; }
    }
    if (!this.active) { if (persisted) this.clearOwner(); return; }
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const drained = await Promise.race([this.active.then(() => true), new Promise<boolean>(resolve => { timeout = setTimeout(() => resolve(false), DRAIN_TIMEOUT_MS); })]);
    if (timeout) clearTimeout(timeout);
    if (!drained && this.token === token) {
      try { stopGoalRun(this.deps.store, session, token, reason, 'unknown'); } catch { /* Retain the unresolved owner. */ }
      this.deps.report('Goal scheduling paused; execution drain is unconfirmed. The owner and unresolved usage remain retained.');
    }
  }

  /** A process signal or Escape requests a stop without waiting for unknown metering. */
  interrupt(): void { if (!this.cancelling && !this.stopRequested) void this.stop('cancelled'); }

  async wait(): Promise<void> {
    while (this.token && !this.stopRequested) {
      await new Promise<void>(resolve => setTimeout(resolve, ROUND_DELAY_MS));
    }
  }

  private schedule(): void {
    if (!this.token || this.timer || this.active) return;
    this.timer = setTimeout(() => { this.timer = undefined; void this.tick(); }, ROUND_DELAY_MS);
  }

  private async tick(): Promise<void> {
    if (!this.token || !this.session) return;
    try {
      if (!this.bound()) { await this.stop('session-changed'); return; }
      const goal = readGoalEdit(this.deps.store, this.session).goal;
      if (!goal || goal.id !== this.goalId || goal.runOwner?.token !== this.token || goal.phase !== 'active') { await this.stop(goal?.scheduling?.reason ?? 'user'); return; }
      if (!this.host.ready()) { this.schedule(); return; }
      const edit = beginGoalRound(this.deps.store, this.session, this.token, () => this.bound() && this.host.ready());
      // The same callback is checked again after publication, immediately before handoff.
      if (!this.bound() || !this.host.ready()) {
        cancelUnsubmittedRound(this.deps.store, this.session, this.token); this.schedule(); return;
      }
      this.outcome = 'answer'; this.failure = undefined;
      const prompt = continuationPrompt(edit.goal!.objective, edit.goal!.id, edit.goal!.scheduling!.round);
      let dispatched = false;
      const submission = Promise.resolve().then(async () => {
        const latest = readGoalEdit(this.deps.store, this.session!).goal;
        if (!this.bound() || !this.host.ready() || !latest || latest.id !== this.goalId || latest.runOwner?.token !== this.token || latest.phase !== 'active') {
          cancelUnsubmittedRound(this.deps.store, this.session!, this.token!); return;
        }
        dispatched = true;
        await this.host.submit(prompt, { source: 'goal-continuation', goalId: latest.id, ownerToken: this.token, round: latest.scheduling!.round });
      });
      this.active = this.drive(submission, () => dispatched);
      await this.active;
    } catch (error) {
      this.deps.report(`Goal scheduling paused: ${runFailure(error)}.`);
      await this.stop(runFailure(error));
    }
  }

  private async drive(submission: Promise<void>, dispatched: () => boolean): Promise<void> {
    const session = this.session!; const token = this.token!;
    const watcher = setInterval(() => {
      try {
        const goal = readGoalEdit(this.deps.store, session).goal;
        if (!this.bound() || !goal || goal.id !== this.goalId || goal.runOwner?.token !== token || goal.phase !== 'active') this.deps.cancel();
      } catch { this.deps.cancel(); }
    }, ROUND_DELAY_MS);
    // An unresolved drain is durable state; this observer must not keep a finished CLI alive.
    watcher.unref();
    try {
      await submission;
    } catch (error) { this.outcome = 'failure'; this.failure ??= runFailure(error); }
    finally { clearInterval(watcher); }
    try {
      const edit = dispatched() ? settleGoalRound(this.deps.store, session, token, this.outcome, this.failure) : readGoalEdit(this.deps.store, session);
      if (edit.goal?.phase !== 'active') {
        if (this.failure) this.deps.report(`Goal scheduling paused: ${this.failure}. Goal completion was not inferred.`);
        this.clearOwner();
      }
    } catch (error) {
      this.deps.report(`Goal round settlement unverified: ${runFailure(error)}. Recovery is required; no new round will be dispatched.`);
      try { stopGoalRun(this.deps.store, session, token, 'recovery-required', 'unknown'); } catch { /* Retain pending round. */ }
      this.stopRequested = true;
    }
    this.active = undefined;
    this.host.settled?.();
    if (!this.stopRequested) this.schedule();
  }

  private bound(): boolean {
    const current = this.deps.current();
    return current.id === this.session?.id && current.createdAt === this.session.createdAt && current.projectRoot === this.session.projectRoot;
  }

  private clearOwner(): void {
    if (this.token && this.session) {
      try { releaseIdleOwner(this.deps.store, this.session, this.token); } catch { /* Never clear a durable pending round. */ }
    }
    this.token = undefined; this.session = undefined; this.goalId = undefined;
  }
}

function continuationPrompt(objective: string, id: string, round: number): string {
  return `Continue the explicitly activated goal ${JSON.stringify(id)} (round ${round}).\nObjective: ${objective}\nUse the recorded conversation and tool results to advance the remaining work. This is an automatic continuation, not new human input or approval. Preserve permission requirements. Do not repeat a side effect already recorded as successful. Report blockers truthfully; response prose does not mark the goal complete.`;
}

function runFailure(error: unknown): GoalRunReason {
  if (error instanceof GoalRunError) return error.reason === 'owned' ? 'unavailable' : error.reason;
  if (error instanceof ModelAdmissionError) return error.code === 'inactive' ? 'user' : error.code;
  return 'failure';
}
