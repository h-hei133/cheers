import { isRecord } from '../core/values/record.js';
import type { AdvisorConfig, AdvisorState } from './model.js';

export function validAdvisorConfig(value: unknown): value is AdvisorConfig {
  return isRecord(value) && text(value.target, 512) && /^[^\s/]+\/[^\s]+$/.test(value.target)
    && integer(value.every, 1, 100) && integer(value.timeoutMs, 100, 60000) && ['turn', 'end'].includes(String(value.mode));
}
export function decodeAdvisor(value: unknown): AdvisorState | undefined {
  if (!isRecord(value) || value.schemaVersion !== 1 || !text(value.sessionId, 256) || !timestamp(value.sessionCreatedAt)
    || !isRecord(value.workspace) || !text(value.workspace.path, 4096) || !text(value.workspace.identity, 256)
    || !integer(value.epoch, 0) || typeof value.enabled !== 'boolean' || !integer(value.eligible, 0) || !integer(value.captured, 0)
    || value.config !== undefined && !validAdvisorConfig(value.config)
    || !['off', 'ready', 'held', 'reviewing', 'reviewed', 'paused', 'no-model', 'unavailable', 'error', 'timeout', 'cancelled', 'stale'].includes(String(value.status))
    || !Array.isArray(value.checkpoints) || value.checkpoints.length > 16 || !value.checkpoints.every(checkpoint)
    || !Array.isArray(value.notes) || value.notes.length > 16 || !value.notes.every(note)
    || value.pending !== undefined && (!isRecord(value.pending) || !text(value.pending.id, 256) || !integer(value.pending.epoch, 0)
      || !text(value.pending.checkpointId, 256) || !timestamp(value.pending.startedAt)
      || value.pending.owner !== undefined && (!isRecord(value.pending.owner) || !text(value.pending.owner.token, 256)
        || !integer(value.pending.owner.pid, 1) || !text(value.pending.owner.hostname, 256) || !timestamp(value.pending.owner.startedAt)))) return undefined;
  return value as unknown as AdvisorState;
}
function checkpoint(value: unknown): boolean {
  return isRecord(value) && text(value.id, 256) && timestamp(value.timestamp) && text(value.sourcePromptEntryId, 256)
    && integer(value.step, 1) && typeof value.willContinue === 'boolean' && typeof value.failed === 'boolean'
    && digest(value.digest) && text(value.text, 32768) && typeof value.truncated === 'boolean' && digest(value.frontier) && digest(value.goal);
}
function note(value: unknown): boolean {
  return isRecord(value) && text(value.id, 256) && text(value.checkpointId, 256) && digest(value.checkpointDigest)
    && integer(value.epoch, 0) && text(value.target, 512) && timestamp(value.timestamp) && text(value.text, 8192)
    && isRecord(value.coverage) && typeof value.coverage.truncated === 'boolean' && Array.isArray(value.coverage.checkpoints)
    && value.coverage.checkpoints.length > 0 && value.coverage.checkpoints.length <= 16
    && value.coverage.checkpoints.every(item => isRecord(item) && text(item.id, 256) && digest(item.digest))
    && (value.submittedAt === undefined || timestamp(value.submittedAt));
}
function text(value: unknown, max: number): value is string { return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(value); }
function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): boolean { return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max; }
function digest(value: unknown): boolean { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function timestamp(value: unknown): boolean { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
