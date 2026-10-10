import { createHash } from 'node:crypto';
import { isRecord } from '../../../core/values/record.js';
import type { BoundSessionScope } from '../../../session/store/bound.js';
import type { LocalJob } from '../model.js';
import { valid, text, validateOrigin, validateScope } from '../validation.js';

export function localDigest(job: Pick<LocalJob, 'id' | 'ownerId' | 'command' | 'directory' | 'timeoutMs' | 'origin' | 'scope' | 'createdAt'>): string {
  const s = job.scope; const o = job.origin;
  return createHash('sha256').update(JSON.stringify([job.id, job.ownerId, job.command, job.directory.path, job.directory.identity, job.timeoutMs, job.createdAt,
    [s.sessionId, s.sessionCreatedAt, s.workspace.path, s.workspace.identity],
    [o.kind, o.principal, o.acceptanceId, o.parentId, o.goalId, o.roomId, o.serviceEpoch, o.hostGeneration, o.sourceEntryId]])).digest('hex');
}
export function validateLocal(value: unknown, scope: BoundSessionScope): asserts value is LocalJob {
  valid(isRecord(value) && Object.keys(value).every(key => ['id', 'backend', 'ownerId', 'command', 'directory', 'timeoutMs', 'digest', 'origin', 'scope', 'createdAt',
    'status', 'dispatchPossible', 'stdout', 'stderr', 'truncated', 'output', 'exitCode', 'note'].includes(key)));
  valid(typeof value.id === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value.id) && value.backend === 'local'
    && text(value.ownerId, 64) && typeof value.command === 'string' && value.command.trim() && Buffer.byteLength(value.command) <= 16384 && !value.command.includes('\0')
    && Number.isSafeInteger(value.timeoutMs) && Number(value.timeoutMs) >= 1000 && Number(value.timeoutMs) <= 300000
    && Number.isSafeInteger(value.createdAt) && Number(value.createdAt) > 0 && /^[0-9a-f]{64}$/.test(String(value.digest)));
  validateOrigin(value.origin); validateScope(value.scope, scope);
  valid(isRecord(value.directory) && Object.keys(value.directory).every(key => ['path', 'identity'].includes(key))
    && text(value.directory.path, 4096) && text(value.directory.identity, 256));
  valid(['queued', 'running', 'paused', 'completed', 'failed', 'cancelled', 'unknown'].includes(String(value.status))
    && typeof value.dispatchPossible === 'boolean' && typeof value.truncated === 'boolean'
    && ['pending', 'complete', 'interrupted', 'unknown'].includes(String(value.output)) && text(value.note, 1024));
  for (const stream of ['stdout', 'stderr']) {
    const encoded = value[stream]; valid(typeof encoded === 'string' && encoded.length <= 87384);
    const bytes = Buffer.from(encoded, 'base64'); valid(bytes.length <= 65536 && bytes.toString('base64') === encoded);
  }
  valid(value.exitCode === undefined || Number.isInteger(value.exitCode) && Number(value.exitCode) >= 0 && Number(value.exitCode) <= 255);
  valid(value.dispatchPossible || ['queued', 'paused', 'cancelled'].includes(String(value.status)));
  valid(!['queued', 'paused'].includes(String(value.status)) || !value.dispatchPossible);
  valid(value.status !== 'completed' || value.exitCode === 0 && value.output === 'complete');
  valid(value.digest === localDigest(value as unknown as LocalJob));
}
