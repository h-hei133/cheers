import { createHash } from 'node:crypto';
import { isRecord } from '../../core/values/record.js';
import { freezeDeep } from '../../core/values/freeze.js';
import type { BoundSessionScope } from '../../session/store/bound.js';
import { validateWorkspace } from '../../runtime/execution/ssh/validation.js';
import { JobStateError, type JobJournal, type JobOrigin, type RemoteJob } from './model.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function jobDigest(job: Pick<RemoteJob, 'id' | 'command' | 'binding' | 'origin' | 'scope' | 'lifetime'>): string {
  const b = job.binding; const s = job.scope; const o = job.origin;
  return createHash('sha256').update(JSON.stringify([job.id, job.command, job.lifetime,
    [s.sessionId, s.sessionCreatedAt, s.workspace.path, s.workspace.identity],
    [b.profileIdentity, b.fingerprint, b.root, b.directoryIdentity, b.uid, b.bootId, b.namespace],
    [o.kind, o.principal, o.acceptanceId, o.parentId, o.goalId, o.roomId, o.serviceEpoch, o.hostGeneration, o.sourceEntryId]])).digest('hex');
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
export function decodeJournal(value: unknown, scope: BoundSessionScope): JobJournal {
  if (value === undefined) return freezeDeep({ version: 1, revision: 0, scope, jobs: [] });
  valid(isRecord(value) && Object.keys(value).every(key => ['version', 'revision', 'scope', 'remote', 'jobs'].includes(key))
    && value.version === 1 && Number.isSafeInteger(value.revision) && Number(value.revision) >= 1);
  validateScope(value.scope, scope); valid(Array.isArray(value.jobs) && value.jobs.length <= 128);
  valid(Buffer.byteLength(JSON.stringify(value)) <= 1024 * 1024);
  try { if (value.remote !== undefined) validateWorkspace(value.remote); } catch { throw new JobStateError('invalid'); }
  const ids = new Set<string>();
  for (const job of value.jobs) { validateJob(job, scope); valid(!ids.has(job.id)); ids.add(job.id); }
  return freezeDeep(value as unknown as JobJournal);
}
function validateJob(value: unknown, scope: BoundSessionScope): asserts value is RemoteJob {
  valid(isRecord(value) && Object.keys(value).every(key => ['id', 'backend', 'command', 'digest', 'origin', 'scope', 'binding', 'createdAt',
    'lifetime', 'status', 'dispatchPossible', 'invocationId', 'exitCode', 'output', 'cancellation', 'note'].includes(key)));
  valid(typeof value.id === 'string' && UUID.test(value.id) && value.backend === 'ssh'
    && typeof value.command === 'string' && value.command.trim() && Buffer.byteLength(value.command) <= 16384 && !value.command.includes('\0')
    && typeof value.digest === 'string' && /^[0-9a-f]{64}$/.test(value.digest));
  validateOrigin(value.origin); validateScope(value.scope, scope);
  try { validateWorkspace(value.binding); } catch { throw new JobStateError('invalid'); }
  valid(Number.isSafeInteger(value.createdAt) && Number(value.createdAt) > 0 && typeof value.dispatchPossible === 'boolean'
    && ['detached', 'parent'].includes(String(value.lifetime))
    && ['queued', 'running', 'completed', 'failed', 'cancelled', 'unknown'].includes(String(value.status))
    && ['pending', 'complete', 'interrupted', 'unknown'].includes(String(value.output)) && text(value.note, 1024));
  valid(value.invocationId === undefined || typeof value.invocationId === 'string' && /^[0-9a-f]{32}$/.test(value.invocationId));
  valid(value.exitCode === undefined || Number.isInteger(value.exitCode) && Number(value.exitCode) >= 0 && Number(value.exitCode) <= 255);
  valid(value.cancellation === undefined || ['requested', 'selected-cgroup-empty'].includes(String(value.cancellation)));
  valid(value.dispatchPossible || (['queued', 'cancelled'].includes(String(value.status)) && value.invocationId === undefined && value.exitCode === undefined));
  valid(value.status !== 'queued' || !value.dispatchPossible);
  valid(value.lifetime === (value.origin.kind === 'local' ? 'detached' : 'parent'));
  valid(value.status !== 'running' || value.invocationId !== undefined && value.dispatchPossible);
  valid(value.status !== 'completed' || value.exitCode === 0 && value.output === 'complete' && value.invocationId !== undefined);
  valid(value.cancellation !== 'selected-cgroup-empty' || value.status === 'cancelled' && value.invocationId !== undefined && value.output === 'interrupted');
  valid(value.digest === jobDigest(value as unknown as RemoteJob));
}
function validateScope(value: unknown, session: BoundSessionScope): asserts value is BoundSessionScope {
  valid(isRecord(value) && Object.keys(value).every(key => ['sessionId', 'sessionCreatedAt', 'workspace'].includes(key))
    && value.sessionId === session.sessionId && value.sessionCreatedAt === session.sessionCreatedAt && isRecord(value.workspace)
    && Object.keys(value.workspace).every(key => ['path', 'identity'].includes(key)) && text(value.workspace.path, 4096) && text(value.workspace.identity, 256));
}
function text(value: unknown, max: number): value is string { return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f-\x9f]/.test(value); }
function valid(value: unknown): asserts value { if (!value) throw new JobStateError('invalid'); }
