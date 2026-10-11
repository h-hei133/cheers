import { createHash } from 'node:crypto';
import path from 'node:path';
import { isRecord } from '../../../core/values/record.js';
import { DAGResolver } from '../../../core/workflow/dagResolver.js';
import type { BoundSessionScope } from '../../../session/store/contract.js';
import { valid, text, validateOrigin, validateScope } from '../validation.js';
import type { DagJob } from './model.js';

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const ID = /^[A-Za-z0-9_.-]{1,64}$/;
export function dagDigest(job: Pick<DagJob, 'id' | 'definition' | 'origin' | 'scope' | 'directory' | 'createdAt' | 'steps'>): string {
  return createHash('sha256').update(JSON.stringify([job.id, job.definition, job.origin, job.scope, job.directory, job.createdAt,
    job.steps.map(step => [step.id, step.jobId])])).digest('hex');
}
export function validateDag(value: unknown, scope: BoundSessionScope): asserts value is DagJob {
  valid(isRecord(value) && Object.keys(value).every(key => ['id', 'backend', 'definition', 'digest', 'origin', 'scope', 'directory', 'createdAt', 'status', 'dispatchPossible', 'steps', 'note'].includes(key)));
  valid(typeof value.id === 'string' && UUID.test(value.id) && value.backend === 'dag' && /^[0-9a-f]{64}$/.test(String(value.digest))
    && Number.isSafeInteger(value.createdAt) && Number(value.createdAt) > 0 && text(value.note, 1024));
  validateOrigin(value.origin); validateScope(value.scope, scope);
  valid(isRecord(value.directory) && Object.keys(value.directory).every(key => ['path', 'identity'].includes(key))
    && text(value.directory.path, 4096) && text(value.directory.identity, 256));
  const relative = path.relative(scope.workspace.path, value.directory.path);
  valid(path.isAbsolute(value.directory.path) && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  valid(isRecord(value.definition) && Object.keys(value.definition).every(key => ['name', 'description', 'source', 'fingerprint', 'maxConcurrency', 'steps'].includes(key)));
  const definition = value.definition;
  valid(text(definition.name, 256) && text(definition.source, 4096) && /^[0-9a-f]{64}$/.test(String(definition.fingerprint))
    && (definition.description === undefined || text(definition.description, 4096)) && Number.isSafeInteger(definition.maxConcurrency)
    && Number(definition.maxConcurrency) >= 1 && Number(definition.maxConcurrency) <= 16);
  valid(Array.isArray(definition.steps) && definition.steps.length > 0 && definition.steps.length <= 32
    && Array.isArray(value.steps) && value.steps.length === definition.steps.length);
  const ids = new Set<string>(); const children = new Set<string>();
  for (const [index, step] of definition.steps.entries()) {
    valid(isRecord(step) && Object.keys(step).every(key => ['id', 'run', 'needs', 'timeoutSeconds'].includes(key))
      && typeof step.id === 'string' && ID.test(step.id) && !ids.has(step.id) && text(step.run, 16384) && step.run.trim()
      && Array.isArray(step.needs) && step.needs.length <= 32 && step.needs.every((id: unknown) => typeof id === 'string' && ID.test(id))
      && Number.isSafeInteger(step.timeoutSeconds) && Number(step.timeoutSeconds) >= 1 && Number(step.timeoutSeconds) <= 300);
    ids.add(step.id);
    const state = value.steps[index];
    valid(isRecord(state) && Object.keys(state).every(key => ['id', 'jobId', 'status', 'dispatchPossible'].includes(key))
      && state.id === step.id && typeof state.jobId === 'string' && UUID.test(state.jobId) && !children.has(state.jobId) && state.jobId !== value.id
      && typeof state.dispatchPossible === 'boolean' && ['queued', 'running', 'completed', 'failed', 'cancelled', 'unknown', 'skipped'].includes(String(state.status)));
    children.add(state.jobId);
    valid(state.dispatchPossible || ['queued', 'skipped', 'cancelled'].includes(String(state.status)));
    valid(state.status !== 'queued' || !state.dispatchPossible);
  }
  const job = value as unknown as DagJob;
  valid(path.dirname(job.definition.source) === path.join(job.directory.path, '.agents', 'workflows')
    && /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,63}\.json$/.test(path.basename(job.definition.source)));
  valid(DAGResolver.resolve(job.definition.steps.map(step => ({ id: step.id, name: step.id, dependencies: step.needs, status: 'pending' }))).isValid);
  valid(typeof value.dispatchPossible === 'boolean' && ['queued', 'running', 'paused', 'completed', 'failed', 'cancelled', 'unknown'].includes(String(value.status))
    && (value.dispatchPossible || ['queued', 'paused', 'cancelled'].includes(String(value.status)))
    && (value.status !== 'queued' || !value.dispatchPossible)
    && (value.dispatchPossible || job.steps.every(step => !step.dispatchPossible))
    && (value.status !== 'completed' || job.steps.every(step => step.status === 'completed')));
  valid(value.digest === dagDigest(job));
}
