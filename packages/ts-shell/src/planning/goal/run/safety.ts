import { isRecord } from '../../../core/values/record.js';
import { decodeRequestLedger } from '../../../core/agent/request/codec.js';
import { projectHistoricalWriteInspection } from '../../../session/continuation/inspection.js';
import type { SessionStateSnapshot } from '../../../session/schema/sessionStateSnapshot.js';
import type { TranscriptEvent } from '../../../session/sessionEventCodec.js';
import type { SessionGoal } from '../model.js';
import { GoalRunError } from './model.js';

export function requireIdleState(state: SessionStateSnapshot): void {
  if (state.runPhase !== undefined && state.runPhase !== 'idle') throw new GoalRunError('recovery-required');
  if (state.pendingPrompt !== undefined) throw new GoalRunError('recovery-required');
  const lifecycle = state.pendingLifecycle;
  if (lifecycle !== undefined && (!isRecord(lifecycle) || !isRecord(lifecycle.pendingTools) || !isRecord(lifecycle.pendingApprovals)
    || Object.keys(lifecycle.pendingTools).length || Object.keys(lifecycle.pendingApprovals).length)) throw new GoalRunError('recovery-required');
}

export function requireReconciledStart(goal: SessionGoal, state: SessionStateSnapshot, events: readonly TranscriptEvent[]): void {
  requireIdleState(state);
  if (goal.scheduling?.pendingRound || projectHistoricalWriteInspection(events).length) throw new GoalRunError('recovery-required');
  const ledger = decodeRequestLedger(state.requestLedger);
  const scope = ledger?.scopes[goal.id];
  if (!ledger || ledger.sessionId !== goal.sessionId || ledger.sessionCreatedAt !== goal.sessionCreatedAt
    || !scope || scope.scope.workspacePath !== goal.workspace.path || scope.scope.workspaceIdentity !== goal.workspace.identity) throw new GoalRunError('history-unknown');
  if (scope.breach) throw new GoalRunError('breach');
  if (scope.historyUnknown || Object.keys(scope.pending).length) throw new GoalRunError('history-unknown');
}

/** Persisted origin and a terminal lifecycle after it bind the result to this round. */
export function persistedRoundOutcome(goal: SessionGoal, state: SessionStateSnapshot, events: readonly TranscriptEvent[]): NonNullable<import('./model.js').GoalScheduling['lastOutcome']> {
  requireIdleState(state);
  const opening = events.findLastIndex(event => event.type === 'message' && event.role === 'user'
    && event.metadata?.source === 'goal-continuation' && event.metadata.goalId === goal.id
    && event.metadata.ownerToken === goal.runOwner?.token && event.metadata.round === goal.scheduling?.round);
  if (opening < 0 || events.slice(opening + 1).some(event => event.type === 'lifecycle' && event.event === 'run-started')) throw new GoalRunError('recovery-required');
  const terminal = events.slice(opening + 1).filter(event => event.type === 'lifecycle').at(-1);
  if (terminal?.type !== 'lifecycle' || !['run-completed', 'run-error'].includes(terminal.event)) throw new GoalRunError('recovery-required');
  if (state.terminalReason === 'stopped_max_turns' && state.terminalClassification === 'stopped') return 'step-limit';
  if (state.status === 'completed' && state.terminalReason === 'completed' && state.terminalClassification === 'success' && terminal.event === 'run-completed') return 'answer';
  if (state.status === 'error' && terminal.event === 'run-error') return state.terminalClassification === 'stopped' ? 'refused' : 'failure';
  throw new GoalRunError('recovery-required');
}
