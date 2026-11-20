import { createPlan as create, editPlan as edit, reviewPlan as review } from '@cheers/planning';
import type { BoundSessionScope } from '../../session/store/contract.js';
import { planPorts } from './codec.js';
import type { PlanCriterion, PlanDraft } from './model.js';

export function createPlan(scope: BoundSessionScope, text: string, goal?: PlanDraft['goal'], sourcePromptEntryId?: string): PlanDraft {
  return create(planPorts, scope, text, goal, sourcePromptEntryId);
}

export function editPlan(plan: PlanDraft, change: { readonly text?: string; readonly criterion?: PlanCriterion; readonly remove?: string }): PlanDraft {
  return edit(planPorts, plan, change);
}

export function reviewPlan(plan: PlanDraft, action: 'approve' | 'reject' | 'execute', version: string): PlanDraft {
  return review(planPorts, plan, action, version);
}
