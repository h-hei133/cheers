import { createHash } from 'node:crypto';
import { isRecord } from '../../core/values/record.js';
import { freezeDeep } from '../../core/values/freeze.js';
import type { PlanCriterion, PlanDraft } from './model.js';

export function textDigest(text: string): string { return createHash('sha256').update(text, 'utf8').digest('hex'); }
export function planVersion(plan: PlanDraft): string {
  return `${plan.id}:${plan.revision}:${textDigest(JSON.stringify({ id: plan.id, revision: plan.revision, sessionId: plan.sessionId,
    sessionCreatedAt: plan.sessionCreatedAt, workspace: plan.workspace, text: plan.text, criteria: plan.criteria,
    goal: plan.goal, sourcePromptEntryId: plan.sourcePromptEntryId }))}`;
}
export function decodePlan(value: unknown): PlanDraft | undefined {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.id !== 'string' || !value.id
    || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1 || typeof value.text !== 'string' || value.text.length > 64 * 1024
    || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(value.text)
    || !Array.isArray(value.criteria) || value.criteria.length > 16 || !value.criteria.every(validPlanCriterion)
    || new Set(value.criteria.map(criterion => criterion.id)).size !== value.criteria.length
    || !['draft', 'approved', 'rejected', 'executing'].includes(String(value.phase))
    || typeof value.sessionId !== 'string' || typeof value.sessionCreatedAt !== 'string' || !isRecord(value.workspace)
    || typeof value.workspace.path !== 'string' || typeof value.workspace.identity !== 'string'
    || typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string'
    || value.sourcePromptEntryId !== undefined && typeof value.sourcePromptEntryId !== 'string'
    || value.goal !== undefined && (!isRecord(value.goal) || typeof value.goal.id !== 'string' || !digest(value.goal.definitionDigest))) return undefined;
  const plan = value as unknown as PlanDraft;
  if (value.approval !== undefined && (!isRecord(value.approval) || value.approval.source !== 'user'
    || typeof value.approval.timestamp !== 'string' || value.approval.version !== planVersion(plan))) return undefined;
  if (['approved', 'executing'].includes(plan.phase) && !plan.approval || plan.phase === 'draft' && plan.approval) return undefined;
  return freezeDeep(plan);
}
export function validPlanCriterion(value: unknown): value is PlanCriterion {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id || typeof value.implementation !== 'boolean') return false;
  if (value.kind === 'artifact') return targetPath(value.path)
    && (value.expected === 'absent' || digest(value.expected));
  return value.kind === 'command' && typeof value.command === 'string' && value.command.trim().length > 0
    && value.command.length <= 8192 && digest(value.commandDigest) && value.commandDigest === textDigest(value.command)
    && Array.isArray(value.targets) && value.targets.length > 0 && value.targets.length <= 8
    && value.targets.every(targetPath);
}
function digest(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function targetPath(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 4096 && !/[\x00-\x1f\x7f-\x9f]/.test(value);
}
