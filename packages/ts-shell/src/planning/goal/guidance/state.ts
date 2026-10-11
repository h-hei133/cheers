import { randomUUID } from 'node:crypto';
import { freezeDeep } from '../../../core/values/freeze.js';
import { isRecord } from '../../../core/values/record.js';
import { textDigest } from '../../plan/codec.js';
import { PlanError } from '../../plan/model.js';
import type { BoundSessionScope } from '../../../session/store/contract.js';
import { guidanceFields, type GuidanceDraft, type GuidanceField, type GuidanceQuestionField } from './model.js';

export function guidanceVersion(draft: GuidanceDraft): string {
  return `${draft.id}:${draft.revision}:${textDigest(JSON.stringify({ id: draft.id, revision: draft.revision,
    sessionId: draft.sessionId, sessionCreatedAt: draft.sessionCreatedAt, workspace: draft.workspace, answers: draft.answers }))}`;
}
export function decodeGuidance(value: unknown): GuidanceDraft | undefined {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.id !== 'string' || !value.id || !Number.isSafeInteger(value.revision)
    || Number(value.revision) < 1 || typeof value.sessionId !== 'string' || typeof value.sessionCreatedAt !== 'string'
    || !isRecord(value.workspace) || typeof value.workspace.path !== 'string' || typeof value.workspace.identity !== 'string'
    || typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string' || !['draft', 'cancelled', 'approved'].includes(String(value.phase))
    || !isRecord(value.answers) || Object.entries(value.answers).some(([field, answer]) => field === 'budget'
      ? !validBudgetAnswer(answer) : !guidanceFields.includes(field as GuidanceQuestionField) || !validAnswer(answer))) return undefined;
  const draft = value as unknown as GuidanceDraft;
  if (value.approval !== undefined && (!isRecord(value.approval) || value.approval.source !== 'user'
    || value.approval.version !== guidanceVersion(draft) || typeof value.approval.goalId !== 'string'
    || typeof value.approval.timestamp !== 'string')) return undefined;
  if ((draft.phase === 'approved') !== Boolean(draft.approval)) return undefined;
  return freezeDeep(draft);
}
export function createGuidance(scope: BoundSessionScope, objective: string): GuidanceDraft {
  const timestamp = new Date().toISOString();
  return freezeDeep({ ...scope, schemaVersion: 1, id: randomUUID(), revision: 1, phase: 'draft',
    answers: validAnswer(objective) ? { objective: objective.trim() } : {}, createdAt: timestamp, updatedAt: timestamp });
}
export function answerGuidance(draft: GuidanceDraft, field: GuidanceField, answer: string): GuidanceDraft {
  if (draft.phase !== 'draft' || (field === 'budget' ? !validBudgetAnswer(answer)
    : !guidanceFields.includes(field) || !validAnswer(answer)) || draft.revision >= Number.MAX_SAFE_INTEGER) throw new PlanError('invalid');
  return freezeDeep({ ...draft, revision: draft.revision + 1, answers: { ...draft.answers, [field]: answer.trim() }, updatedAt: new Date().toISOString() });
}
export function validAnswer(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 4096
    && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(value)
    && !/^(?:n|no|cancel|skip|refuse|拒绝|取消)$/i.test(value.trim());
}
function validBudgetAnswer(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const answer = value.trim();
  return answer === 'off' || /^(0|[1-9][0-9]*)$/.test(answer) && Number.isSafeInteger(Number(answer));
}
