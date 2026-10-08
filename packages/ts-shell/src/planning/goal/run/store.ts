import type { Session } from '../../../session/schema/sessionRecord.js';
import type { TranscriptEvent } from '../../../session/sessionEventCodec.js';
import type { SessionGoal } from '../model.js';
import { readGoalEdit, updateGoalScheduling, writeGoal, type GoalStoreHost, type SessionGoalEdit } from '../store.js';
import { GoalRunError, type GoalRunOwner, type GoalRunReason, type GoalScheduling } from './model.js';
import { ownerDisposition } from './owner.js';
import { persistedRoundOutcome, requireIdleState, requireReconciledStart } from './safety.js';

export interface GoalRunStoreHost extends GoalStoreHost {
  readonly getTranscriptEvents: (sessionId: string) => TranscriptEvent[];
}

export function recoverGoalRun(host: GoalRunStoreHost, session: Session): SessionGoalEdit {
  const edit = readGoalEdit(host, session);
  if (!edit.goal || edit.goal.phase !== 'active' && !edit.goal.runOwner) return edit;
  if (!edit.goal.runOwner) return writeGoal(host, session, edit, { type: 'reentry' });
  if (ownerDisposition(edit.goal.runOwner) !== 'dead') return edit;
  return updateGoalScheduling(host, session, edit, goal => change(goal, {
    ...(goal.phase === 'active' ? { phase: 'paused' } : {}), runOwner: null,
    scheduling: { ...goal.scheduling!, phase: 'paused', reason: goal.scheduling!.pendingRound ? 'recovery-required' : 'session-reentry',
      drain: goal.scheduling!.pendingRound ? 'unknown' : 'settled', updatedAt: now() },
  }));
}

export function claimGoalRun(host: GoalRunStoreHost, session: Session, owner: GoalRunOwner): SessionGoalEdit {
  return updateGoalScheduling(host, session, readGoalEdit(host, session), (goal, state) => {
    if (goal.phase !== 'active') throw new GoalRunError('user');
    if (goal.runOwner) throw new GoalRunError('owned');
    requireReconciledStart(goal, state, host.getTranscriptEvents(session.id));
    return change(goal, { runOwner: owner, scheduling: { schemaVersion: 1, phase: 'ready', round: goal.scheduling?.round ?? 0,
      pendingRound: false, updatedAt: now() } });
  });
}

export function recordStartRefusal(host: GoalRunStoreHost, session: Session, reason: GoalRunReason): void {
  const edit = readGoalEdit(host, session);
  if (!edit.goal || edit.goal.runOwner || edit.goal.phase !== 'active') return;
  updateGoalScheduling(host, session, edit, goal => change(goal, { phase: 'paused',
    scheduling: { schemaVersion: 1, ...goal.scheduling, phase: 'paused', round: goal.scheduling?.round ?? 0,
      pendingRound: goal.scheduling?.pendingRound ?? false, updatedAt: now(), reason,
      drain: goal.scheduling?.pendingRound ? 'unknown' : 'settled' } }));
}

export function beginGoalRound(host: GoalRunStoreHost, session: Session, token: string, ready: () => boolean): SessionGoalEdit {
  return updateGoalScheduling(host, session, readGoalEdit(host, session), (goal, state) => {
    requireOwner(goal, token);
    if (goal.phase !== 'active' || goal.scheduling?.phase !== 'ready' || !ready()) throw new GoalRunError('user');
    requireIdleState(state);
    if (goal.scheduling.round >= Number.MAX_SAFE_INTEGER) throw new GoalRunError('unavailable');
    return change(goal, { scheduling: { ...goal.scheduling, phase: 'running', round: goal.scheduling.round + 1,
      pendingRound: true, updatedAt: now() } });
  });
}

export function settleGoalRound(host: GoalRunStoreHost, session: Session, token: string,
  outcome: NonNullable<GoalScheduling['lastOutcome']>, reason?: GoalRunReason): SessionGoalEdit {
  return updateGoalScheduling(host, session, readGoalEdit(host, session), (goal, state) => {
    requireOwner(goal, token);
    if (!goal.scheduling?.pendingRound) throw new GoalRunError('unavailable');
    const persisted = persistedRoundOutcome(goal, state, host.getTranscriptEvents(session.id));
    if (persisted !== outcome) {
      outcome = persisted;
      reason = persisted === 'failure' ? 'failure' : persisted === 'refused' ? 'refused' : reason;
    }
    const pause = goal.phase !== 'active' || reason !== undefined;
    return change(goal, { ...(goal.phase === 'active' && pause ? { phase: 'paused' } : {}),
      runOwner: pause ? null : goal.runOwner, scheduling: { ...goal.scheduling,
        phase: pause ? 'paused' : 'ready', pendingRound: false, updatedAt: now(), lastOutcome: outcome,
        ...(pause ? { reason: reason ?? goal.scheduling.reason ?? 'user', drain: 'settled' } : {}) } });
  });
}

/** Publication was followed by a failed host readiness check; no prompt was handed off. */
export function cancelUnsubmittedRound(host: GoalRunStoreHost, session: Session, token: string): void {
  updateGoalScheduling(host, session, readGoalEdit(host, session), (goal, state) => {
    requireOwner(goal, token); requireIdleState(state);
    const events = host.getTranscriptEvents(session.id);
    if (events.some(event => event.type === 'message' && event.metadata?.ownerToken === token && event.metadata.round === goal.scheduling!.round)) throw new GoalRunError('recovery-required');
    return change(goal, { scheduling: { ...goal.scheduling!, pendingRound: false,
      phase: goal.phase === 'active' ? 'ready' : 'paused', updatedAt: now() } });
  });
}

export function stopGoalRun(host: GoalRunStoreHost, session: Session, token: string, reason: GoalRunReason,
  drain: 'pending' | 'unknown' | 'settled' = 'pending'): SessionGoalEdit {
  return updateGoalScheduling(host, session, readGoalEdit(host, session), goal => {
    requireOwner(goal, token);
    const pending = goal.scheduling!.pendingRound;
    return change(goal, { ...(goal.phase === 'active' ? { phase: 'paused' } : {}),
      runOwner: pending ? goal.runOwner : null, scheduling: { ...goal.scheduling!, phase: pending ? 'draining' : 'paused',
        reason, drain: pending ? drain : 'settled', updatedAt: now() } });
  });
}

export function releaseIdleOwner(host: GoalRunStoreHost, session: Session, token: string): void {
  const edit = readGoalEdit(host, session);
  if (edit.goal?.runOwner?.token !== token || edit.goal.scheduling?.pendingRound) return;
  updateGoalScheduling(host, session, edit, goal => change(goal, { runOwner: null,
    scheduling: { ...goal.scheduling!, phase: 'paused', updatedAt: now(), drain: 'settled' } }));
}

function requireOwner(goal: SessionGoal, token: string): void {
  if (goal.runOwner?.token !== token || !goal.scheduling) throw new GoalRunError('owned');
}
function change(goal: SessionGoal, update: Partial<SessionGoal>): SessionGoal {
  if (goal.revision >= Number.MAX_SAFE_INTEGER) throw new GoalRunError('unavailable');
  return { ...goal, ...update, revision: goal.revision + 1, updatedAt: now() };
}
function now(): string { return new Date().toISOString(); }
