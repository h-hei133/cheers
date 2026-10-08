import { sameValue } from '../../config/values.js';
import type { Session } from '../../session/schema/sessionRecord.js';
import { publishBoundSessionState, readBoundSessionState, type BoundSessionHost, type BoundSessionState } from '../../session/store/bound.js';
import { decodePlan } from './codec.js';
import { PlanError, type PlanDraft } from './model.js';
import { planAcceptance } from '../goal/acceptance/approval.js';
import { decodeGoal } from '../goal/codec.js';
import { goalDefinition } from '../goal/acceptance/definition.js';

export interface PlanEdit { readonly bound: BoundSessionState; readonly plan?: PlanDraft }
export function readPlan(host: BoundSessionHost, session: Session): PlanEdit {
  const bound = readBoundSessionState(host, session); const plan = decodePlan(bound.state.plan);
  if (bound.state.plan !== undefined && !plan) throw new PlanError('invalid');
  if (plan && (plan.sessionId !== bound.scope.sessionId || plan.sessionCreatedAt !== bound.scope.sessionCreatedAt
    || !sameValue(plan.workspace, bound.scope.workspace))) throw new PlanError('stale');
  return { bound, ...(plan ? { plan } : {}) };
}
export function writePlan(host: BoundSessionHost, session: Session, baseline: PlanEdit, plan: PlanDraft): PlanEdit {
  if (!decodePlan(plan) || plan.sessionId !== baseline.bound.scope.sessionId || plan.sessionCreatedAt !== baseline.bound.scope.sessionCreatedAt
    || !sameValue(plan.workspace, baseline.bound.scope.workspace)) throw new PlanError('invalid');
  const bound = publishBoundSessionState(host, session, baseline.bound, (current, previous) => sameValue(current.plan, previous.plan),
    (state, scope) => {
      const goal = decodeGoal(state.goal);
      const binding = goal && !['complete', 'dropped'].includes(goal.phase) ? { id: goal.id, definitionDigest: goalDefinition(goal) } : undefined;
      if (JSON.stringify(binding) !== JSON.stringify(plan.goal)) throw new PlanError('stale');
      const newlyApproved = plan.phase === 'approved' && (baseline.plan?.phase !== 'approved' || !sameValue(plan.approval, baseline.plan.approval));
      return { ...state, plan, goalAcceptance: newlyApproved ? planAcceptance(state, scope, plan)
        : ['draft', 'rejected'].includes(plan.phase) ? undefined : state.goalAcceptance };
    });
  return { bound, plan: decodePlan(bound.state.plan)! };
}
