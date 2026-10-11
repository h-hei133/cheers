import { createHash } from 'node:crypto';
import { isRecord } from '../../../core/values/record.js';
import type { BoundSessionScope } from '../../../session/store/contract.js';
import type { AgentJob } from './model.js';
import { text, valid, validateOrigin, validateScope } from '../validation.js';

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const statuses = ['queued', 'running', 'paused', 'completed', 'failed', 'cancelled', 'unknown'];
export function agentDigest(job: Pick<AgentJob, 'id' | 'scope' | 'origin' | 'createdAt' | 'prompt'>): string {
  return createHash('sha256').update(JSON.stringify([job.id, job.scope, job.origin, job.createdAt, job.prompt])).digest('hex');
}
export function validateAgent(value: unknown, scope: BoundSessionScope): asserts value is AgentJob {
  valid(isRecord(value) && Object.keys(value).every(key => ['id', 'backend', 'scope', 'origin', 'createdAt', 'prompt', 'digest',
    'childSessionId', 'child', 'checkpoint', 'runs', 'status', 'text', 'truncated', 'output', 'note'].includes(key)));
  valid(uuid.test(String(value.id)) && value.backend === 'agent' && prompt(value.prompt)
    && Number.isSafeInteger(value.createdAt) && Number(value.createdAt) > 0 && text(value.digest, 64)
    && value.childSessionId === `sess_agent_${value.id}`);
  validateScope(value.scope, scope); validateOrigin(value.origin);
  valid(statuses.includes(String(value.status)) && typeof value.text === 'string' && Buffer.byteLength(value.text) <= 65536
    && typeof value.truncated === 'boolean' && ['pending', 'complete', 'interrupted', 'unknown'].includes(String(value.output)) && text(value.note, 1024));
  if (value.child !== undefined) {
    valid(isRecord(value.child) && Object.keys(value.child).every(key => ['scope', 'directoryIdentity'].includes(key))
      && text(value.child.directoryIdentity, 256) && isRecord(value.child.scope));
    valid(text(value.child.scope.sessionId, 256) && text(value.child.scope.sessionCreatedAt, 128));
    validateScope(value.child.scope, value.child.scope as unknown as BoundSessionScope);
    valid(value.child.scope.sessionId === value.childSessionId && value.child.scope.sessionId !== scope.sessionId && value.child.scope.workspace.path === scope.workspace.path
      && value.child.scope.workspace.identity === scope.workspace.identity && checkpoint(value.checkpoint));
  } else valid(value.checkpoint === undefined);
  valid(Array.isArray(value.runs) && value.runs.length <= 16 && (!value.runs.length || value.child !== undefined));
  const ids = new Set<string>();
  for (const run of value.runs) {
    valid(isRecord(run) && Object.keys(run).every(key => ['id', 'prompt', 'createdAt', 'dispatchPossible', 'status', 'checkpoint'].includes(key))
      && uuid.test(String(run.id)) && !ids.has(String(run.id)) && prompt(run.prompt) && run.dispatchPossible === true
      && Number.isSafeInteger(run.createdAt) && Number(run.createdAt) > 0 && statuses.includes(String(run.status))
      && !['queued'].includes(String(run.status)) && checkpoint(run.checkpoint));
    ids.add(String(run.id));
  }
  valid(value.status !== 'completed' || value.runs.length > 0 && value.output === 'complete');
  valid(value.status !== 'running' || value.runs.length > 0 && value.runs.at(-1).status === 'running');
  valid(value.status !== 'queued' || value.runs.length === 0);
  valid(value.digest === agentDigest(value as unknown as AgentJob));
}
export function prompt(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim()) && Buffer.byteLength(value) <= 16384 && !value.includes('\0');
}
function checkpoint(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).every(key => ['entryId', 'digest'].includes(key))
    && text(value.entryId, 256) && /^[0-9a-f]{64}$/.test(String(value.digest));
}
