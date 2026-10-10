import { isRecord } from '../../core/values/record.js';
import type { BoundSessionScope } from '../../session/store/bound.js';
import { JobStateError, type JobOrigin } from './model.js';

export function valid(value: unknown): asserts value {
  if (!value) throw new JobStateError('invalid');
}
export function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f-\x9f]/.test(value);
}
export function validateOrigin(value: unknown): asserts value is JobOrigin {
  valid(isRecord(value) && Object.keys(value).every(key => ['kind', 'principal', 'acceptanceId', 'parentId', 'goalId', 'roomId', 'serviceEpoch', 'hostGeneration', 'sourceEntryId'].includes(key)));
  valid(['local', 'collaboration', 'goal', 'advisor'].includes(String(value.kind)));
  for (const key of ['principal', 'acceptanceId', 'parentId', 'goalId', 'roomId', 'serviceEpoch', 'sourceEntryId']) valid(value[key] === undefined || text(value[key], 256));
  const collab = value.kind === 'collaboration' || ['principal', 'acceptanceId', 'roomId', 'serviceEpoch', 'hostGeneration'].some(key => value[key] !== undefined);
  valid(!collab || (text(value.principal, 256) && text(value.acceptanceId, 256) && text(value.roomId, 256)
    && text(value.serviceEpoch, 256) && Number.isSafeInteger(value.hostGeneration) && Number(value.hostGeneration) >= 1));
  valid(value.kind !== 'goal' || text(value.goalId, 256)); valid(value.kind !== 'advisor' || text(value.parentId, 256));
}
export function validateScope(value: unknown, session: BoundSessionScope): asserts value is BoundSessionScope {
  valid(isRecord(value) && Object.keys(value).every(key => ['sessionId', 'sessionCreatedAt', 'workspace'].includes(key))
    && value.sessionId === session.sessionId && value.sessionCreatedAt === session.sessionCreatedAt && isRecord(value.workspace)
    && Object.keys(value.workspace).every(key => ['path', 'identity'].includes(key)) && text(value.workspace.path, 4096) && text(value.workspace.identity, 256));
}
