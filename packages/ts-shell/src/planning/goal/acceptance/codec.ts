import { isRecord } from '../../../core/values/record.js';
import type { AcceptanceState, VerifiedCompletion } from './model.js';
import type { NativeCommandProof } from '../../../runtime/execution/proof.js';
import { validPlanCriterion } from '../../plan/codec.js';

export function decodeAcceptance(value: unknown): AcceptanceState | undefined {
  if (!isRecord(value) || value.schemaVersion !== 1 || !text(value.goalId) || !digest(value.definitionDigest)
    || !text(value.planVersion) || !criteria(value.criteria)
    || !timestamp(value.approvedAt) || !nonnegative(value.operationBaseline)
    || !isRecord(value.checks) || !isRecord(value.pending) || Object.keys(value.checks).length > 16 || Object.keys(value.pending).length > 64) return undefined;
  const definitions = value.criteria;
  for (const [id, evidence] of Object.entries(value.checks)) {
    if (!isRecord(evidence) || evidence.criterionId !== id || !definitions.some(criterion => criterion.id === id && criterion.kind === 'command')
      || !text(evidence.sourcePromptEntryId)
      || !nativeProof(evidence.native) || !Array.isArray(evidence.targets) || !evidence.targets.every(target)
      || evidence.targets.length > 8 || !nonnegative(evidence.operationSequence) || typeof evidence.known !== 'boolean') return undefined;
  }
  for (const [id, pending] of Object.entries(value.pending)) {
    if (!isRecord(pending) || !nativeStart(pending.native) || pending.native.invocationId !== id || !text(pending.sourcePromptEntryId) || typeof pending.known !== 'boolean'
      || !isRecord(pending.targets) || Object.keys(pending.targets).length > 16
      || !Object.entries(pending.targets).every(([criterionId, items]) => definitions.some(criterion => criterion.id === criterionId && criterion.kind === 'command')
        && Array.isArray(items) && items.length <= 8 && items.every(target))) return undefined;
  }
  return value as unknown as AcceptanceState;
}
export function decodeVerifiedCompletion(value: unknown): VerifiedCompletion | undefined {
  if (!isRecord(value) || value.source !== 'verified-acceptance' || !timestamp(value.timestamp)
    || !text(value.planVersion) || !digest(value.definitionDigest) || !criteria(value.criteria)
    || !Array.isArray(value.evidence) || value.criteria.length !== value.evidence.length) return undefined;
  const definitions = value.criteria;
  if (!value.evidence.every(item => {
      if (!isRecord(item)) return false;
      const criterion = definitions.find(candidate => candidate.id === item.criterionId);
      if (!criterion || item.kind !== criterion.kind || !Array.isArray(item.targets) || !item.targets.length || item.targets.length > 8
        || !item.targets.every(target) || !Array.isArray(item.operationReceipts) || item.operationReceipts.length > 8
        || !item.operationReceipts.every(receipt => isRecord(receipt) && text(receipt.operationId)
          && nonnegative(receipt.revision) && Number(receipt.revision) > 0 && nonnegative(receipt.sequence) && Number(receipt.sequence) > 0)
        || criterion.implementation && !item.operationReceipts.length) return false;
      if (criterion.kind === 'command') return nativeProof(item.native) && item.native.status === 'completed' && item.native.exitCode === 0
        && item.native.commandDigest === criterion.commandDigest && text(item.sourcePromptEntryId);
      const observed = item.targets[0]!.version;
      return item.targets.length === 1 && (criterion.expected === 'absent' ? observed.state === 'absent'
        : observed.state === 'exists' && observed.hash === criterion.expected);
    }) || new Set(value.evidence.map(item => item.criterionId)).size !== value.evidence.length) return undefined;
  return value as unknown as VerifiedCompletion;
}
export function nativeStart(value: unknown): value is import('../../../runtime/execution/proof.js').NativeCommandStart {
  return isRecord(value) && value.schemaVersion === 1 && typeof value.invocationId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.invocationId)
    && text(value.callId) && text(value.sessionId) && digest(value.commandDigest)
    && isRecord(value.cwd) && text(value.cwd.path) && text(value.cwd.identity) && timestamp(value.startedAt);
}
export function nativeProof(value: unknown): value is NativeCommandProof {
  return nativeStart(value) && isRecord(value) && timestamp(value.settledAt)
    && ['completed', 'failed', 'timeout', 'cancelled'].includes(String(value.status)) && (value.exitCode === null || Number.isInteger(value.exitCode));
}
function target(value: unknown): value is import('./model.js').TargetObservation {
  return isRecord(value) && text(value.path) && isRecord(value.version)
    && (value.version.state === 'absent' || value.version.state === 'exists' && digest(value.version.hash)
      && text(value.version.identity) && nonnegative(value.version.mode));
}
function digest(value: unknown): boolean { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 8192; }
function timestamp(value: unknown): boolean { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function nonnegative(value: unknown): boolean { return Number.isSafeInteger(value) && Number(value) >= 0; }
function criteria(value: unknown): value is readonly import('../../plan/model.js').PlanCriterion[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 16 && value.every(validPlanCriterion)
    && new Set(value.map(criterion => criterion.id)).size === value.length;
}
