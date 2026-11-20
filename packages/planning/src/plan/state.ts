import { randomUUID } from 'node:crypto';
import { decodePlan, planVersion } from './codec.js';
import { PlanError, type PlanCriterion, type PlanDraft, type PlanPorts, type PlanScope } from './model.js';

export function createPlan(ports: PlanPorts, scope: PlanScope, text: string, goal?: PlanDraft['goal'], sourcePromptEntryId?: string): PlanDraft {
  const timestamp = new Date().toISOString();
  return valid(ports, { ...scope, schemaVersion: 1, id: randomUUID(), revision: 1, text, criteria: [], phase: 'draft',
    createdAt: timestamp, updatedAt: timestamp, ...(goal ? { goal } : {}), ...(sourcePromptEntryId ? { sourcePromptEntryId } : {}) });
}
export function editPlan(ports: PlanPorts, plan: PlanDraft, change: { readonly text?: string; readonly criterion?: PlanCriterion; readonly remove?: string }): PlanDraft {
  if (plan.revision >= Number.MAX_SAFE_INTEGER) throw new PlanError('invalid');
  if (change.remove && !plan.criteria.some(criterion => criterion.id === change.remove)) throw new PlanError('stale');
  const { approval: _approval, ...base } = plan;
  return valid(ports, { ...base, revision: plan.revision + 1, phase: 'draft', updatedAt: new Date().toISOString(),
    text: change.text ?? plan.text, criteria: change.criterion ? [...plan.criteria, change.criterion]
      : change.remove ? plan.criteria.filter(criterion => criterion.id !== change.remove) : plan.criteria });
}
export function reviewPlan(ports: PlanPorts, plan: PlanDraft, action: 'approve' | 'reject' | 'execute', version: string): PlanDraft {
  if (version !== planVersion(plan)) throw new PlanError('stale');
  const timestamp = new Date().toISOString();
  if (action === 'execute') {
    if (!plan.approval || plan.approval.version !== version || !['approved', 'executing'].includes(plan.phase)) throw new PlanError('unapproved');
    return valid(ports, { ...plan, phase: 'executing', updatedAt: timestamp });
  }
  if (action === 'approve') {
    if (!plan.text.trim()) throw new PlanError('invalid');
    return valid(ports, { ...plan, phase: 'approved', updatedAt: timestamp, approval: { source: 'user', version, timestamp } });
  }
  const { approval: _approval, ...base } = plan;
  return valid(ports, { ...base, phase: 'rejected', updatedAt: timestamp });
}
function valid(ports: PlanPorts, value: PlanDraft): PlanDraft {
  const plan = decodePlan(ports, value);
  if (!plan) throw new PlanError('invalid');
  return plan;
}
