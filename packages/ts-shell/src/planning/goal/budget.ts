import { createRequestPolicy } from '../../core/agent/request/policy.js';
import { ModelAdmissionError, type RequestPolicy } from '../../core/agent/request/model.js';
import { captureWorkspaceRoot } from '../../core/workspace/roots.js';
import { sessionRequestStore } from '../../session/store/requests.js';
import type { Session } from '../../session/schema/sessionRecord.js';
import { decodeGoal } from './codec.js';
import { goalIsDetached, readGoalEdit, type GoalStoreHost } from './store.js';

const summaries = new WeakMap<GoalStoreHost, Map<string, number>>();

/** Capture an identity, then consult its live cap and phase at every reservation/handoff. */
export function goalRequestPolicy(host: GoalStoreHost, session: Session, ownerToken?: string): RequestPolicy | undefined {
  try {
    const edit = readGoalEdit(host, session);
    const goal = edit.goal;
    if (!goal || goal.phase === 'complete' || goal.phase === 'dropped') return undefined;
    if (goalIsDetached(edit)) return blockedPolicy('inactive');
    if (goal.runOwner && goal.runOwner.token !== ownerToken) return blockedPolicy('inactive');
    const scope = { id: goal.id, workspacePath: goal.workspace.path, workspaceIdentity: goal.workspace.identity };
    const store = sessionRequestStore(host, session, scope, view => {
      const current = decodeGoal(view.state.goal);
      const root = captureWorkspaceRoot(view.projectRoot, view.projectRoot, 'read');
      if (!current || current.id !== goal.id || current.phase !== goal.phase || current.sessionId !== session.id
        || current.sessionCreatedAt !== session.createdAt || current.workspace.path !== scope.workspacePath
        || current.workspace.identity !== scope.workspaceIdentity || root.path !== scope.workspacePath || root.identity !== scope.workspaceIdentity
        || (ownerToken !== undefined && current.runOwner?.token !== ownerToken)
        || (current.runOwner !== null && current.runOwner.token !== ownerToken)) throw new ModelAdmissionError('inactive');
      return { cap: current.tokenBudget };
    });
    return summaryPolicy(createRequestPolicy(store, goal.id), () => {
      let latest: ReturnType<typeof readGoalEdit>;
      try { latest = readGoalEdit(host, session); } catch { return false; }
      const current = latest.goal;
      if (!current || goalIsDetached(latest) || current.id !== goal.id || current.phase !== goal.phase
        || current.tokenBudget === undefined || current.sessionId !== session.id || current.sessionCreatedAt !== session.createdAt
        || current.workspace.path !== scope.workspacePath || current.workspace.identity !== scope.workspaceIdentity
        || (ownerToken !== undefined && current.runOwner?.token !== ownerToken)
        || (current.runOwner !== null && current.runOwner.token !== ownerToken)) return false;
      let goals = summaries.get(host);
      if (!goals) { goals = new Map(); summaries.set(host, goals); }
      if (goals.get(goal.id) === current.tokenBudget) return false;
      goals.set(goal.id, current.tokenBudget);
      return true;
    });
  } catch { return blockedPolicy('unavailable'); }
}

function summaryPolicy(policy: RequestPolicy, claim: () => boolean): RequestPolicy {
  return { ...policy, claimBudgetSummary: claim,
    ...(policy.withCompletionReserve ? { withCompletionReserve: (tokens: () => number) => summaryPolicy(policy.withCompletionReserve!(tokens), claim) } : {}),
    ...(policy.withAdmission ? { withAdmission: (admit: () => void) => summaryPolicy(policy.withAdmission!(admit), claim) } : {}) };
}

function blockedPolicy(code: ModelAdmissionError['code']): RequestPolicy {
  return { reserve: () => { throw new ModelAdmissionError(code); } };
}
