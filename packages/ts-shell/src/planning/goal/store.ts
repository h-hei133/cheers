import { freezeDeep } from '../../core/values/freeze.js';
import { sameValue } from '../../config/values.js';
import type { Session } from '../../session/schema/sessionRecord.js';
import type { SessionFileLayout } from '../../session/store/sessionFileLayout.js';
import { publishBoundSessionState, readBoundSessionState, SessionPublicationError,
  type BoundSessionHost, type BoundSessionState } from '../../session/store/bound.js';
import { decodeGoal, goalMatchesScope } from './codec.js';
import { GoalWriteError, type GoalAction, type GoalScope, type SessionGoal } from './model.js';
import { transitionGoal } from './state.js';
import { decodeRequestLedger } from '../../core/agent/request/codec.js';
import { createRequestLedger, initializeRequestScope } from '../../core/agent/request/ledger.js';
import type { SessionStateSnapshot } from '../../session/schema/sessionStateSnapshot.js';
import { GoalRunError } from './run/model.js';

export type GoalStoreHost = BoundSessionHost;
class GoalEdit {
  constructor(readonly layout: SessionFileLayout, readonly directoryIdentity: string, readonly scope: GoalScope,
    readonly goal: SessionGoal | undefined, readonly rawGoal: unknown, readonly requestLedger: unknown,
    readonly state: SessionStateSnapshot, readonly bound: BoundSessionState) { freezeDeep(this); }
}
export type SessionGoalEdit = GoalEdit;

export function readGoalEdit(host: GoalStoreHost, session: Session): SessionGoalEdit {
  try { return goalEdit(readBoundSessionState(host, session)); }
  catch (error) { throw goalError(error); }
}

/** Feature transitions share the existing session identity, CAS and publication owner. */
export function writeGoal(host: GoalStoreHost, session: Session, baseline: SessionGoalEdit, action: GoalAction): SessionGoalEdit {
  return publishGoal(host, session, baseline, (current, scope) => transitionGoal(current, scope, action),
    action.type === 'set' || action.type === 'import' || action.type === 'prepare');
}
export function updateGoalScheduling(host: GoalStoreHost, session: Session, baseline: SessionGoalEdit,
  update: (goal: SessionGoal, state: SessionStateSnapshot) => SessionGoal): SessionGoalEdit {
  return publishGoal(host, session, baseline, (goal, _scope, state) => {
    if (!goal || !goalMatchesScope(goal, baseline.scope)) throw new GoalWriteError('conflict');
    const updated = update(goal, state);
    const changed = { ...updated, controlRevision: goal.controlRevision + (updated.phase !== goal.phase ? 1 : 0) };
    if (changed.id !== goal.id || !decodeGoal(changed)) throw new GoalWriteError('invalid'); return changed;
  }, false);
}
function publishGoal(host: GoalStoreHost, session: Session, baseline: SessionGoalEdit,
  update: (goal: SessionGoal | undefined, scope: GoalScope, state: SessionStateSnapshot) => SessionGoal | undefined,
  initializesLedger: boolean): SessionGoalEdit {
  if (!(baseline instanceof GoalEdit)) throw new GoalWriteError('invalid');
  try {
    const saved = publishBoundSessionState(host, session, baseline.bound, (current, previous) => sameValue(current.goal, previous.goal),
      (state, scope) => {
        const current = decodeStoredGoal(state); const goal = update(current, scope, state);
        if (sameValue(goal, current)) return state;
        let requestLedger = state.requestLedger;
        if (goal && initializesLedger) {
          const binding = { sessionId: session.id, sessionCreatedAt: session.createdAt, directoryIdentity: baseline.directoryIdentity };
          const ledger = requestLedger === undefined ? createRequestLedger(binding) : decodeRequestLedger(requestLedger);
          if (!ledger || ledger.sessionId !== binding.sessionId || ledger.sessionCreatedAt !== binding.sessionCreatedAt
            || ledger.directoryIdentity !== binding.directoryIdentity) throw new GoalWriteError('invalid');
          requestLedger = initializeRequestScope(ledger, { id: goal.id, workspacePath: goal.workspace.path, workspaceIdentity: goal.workspace.identity }, false);
        }
        return { ...state, goal, ...(requestLedger !== undefined ? { requestLedger } : {}) };
      });
    return goalEdit(saved);
  } catch (error) { if (error instanceof GoalRunError) throw error; throw goalError(error); }
}
export function goalIsDetached(edit: SessionGoalEdit): boolean { return edit.goal !== undefined && !goalMatchesScope(edit.goal, edit.scope); }
function goalEdit(bound: BoundSessionState): SessionGoalEdit {
  return new GoalEdit(bound.layout, bound.directoryIdentity, bound.scope, decodeStoredGoal(bound.state), bound.state.goal,
    bound.state.requestLedger, bound.state, bound);
}
function decodeStoredGoal(state: SessionStateSnapshot): SessionGoal | undefined {
  const goal = state.goal === undefined ? undefined : decodeGoal(state.goal);
  if (state.goal !== undefined && !goal) throw new GoalWriteError('invalid'); return goal;
}
function goalError(error: unknown): GoalWriteError {
  if (error instanceof GoalWriteError) return error;
  return error instanceof SessionPublicationError ? new GoalWriteError(error.code, error.state) : new GoalWriteError('unavailable');
}
