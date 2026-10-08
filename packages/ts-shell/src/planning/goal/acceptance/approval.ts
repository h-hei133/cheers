import type { SessionStateSnapshot } from '../../../session/schema/sessionStateSnapshot.js';
import type { BoundSessionScope } from '../../../session/store/bound.js';
import type { PlanDraft } from '../../plan/model.js';
import { planVersion } from '../../plan/codec.js';
import { decodeGoal } from '../codec.js';
import { goalDefinition } from './definition.js';
import { scopedOperations, operationSequence } from './targets.js';
import type { AcceptanceState } from './model.js';
import { PlanError } from '../../plan/model.js';

export function planAcceptance(state: SessionStateSnapshot, scope: BoundSessionScope, plan: PlanDraft): AcceptanceState | undefined {
  const goal = decodeGoal(state.goal);
  const binding = goal && !['complete', 'dropped'].includes(goal.phase) ? { id: goal.id, definitionDigest: goalDefinition(goal) } : undefined;
  if (JSON.stringify(binding) !== JSON.stringify(plan.goal)) throw new PlanError('stale');
  if (!goal || !plan.approval || !plan.criteria.length) return undefined;
  return { schemaVersion: 1, goalId: goal.id, definitionDigest: goalDefinition(goal), planVersion: planVersion(plan), criteria: plan.criteria,
    approvedAt: plan.approval.timestamp, operationBaseline: operationSequence(scopedOperations(scope)), checks: {}, pending: {} };
}
