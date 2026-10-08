import path from 'node:path';
import { normalizeWorkspaceRelativePath } from '../recoveryAuthorityStore.js';
import { contentHashPattern, safeRecoveryId } from '../record.js';
import type { ContentVersion, OperationFile, OperationReceipt, OperationScope, WorkspaceIdentity } from './model.js';

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function identity(value: unknown): value is WorkspaceIdentity {
  return object(value) && typeof value.path === 'string' && path.isAbsolute(value.path)
    && path.resolve(value.path) === value.path && !/[\x00-\x1f\x7f-\x9f]/.test(value.path)
    && typeof value.identity === 'string' && /^\d+:\d+:[\d.]+$/.test(value.identity);
}

function version(value: unknown): value is ContentVersion {
  return object(value) && (value.state === 'absent' || (value.state === 'exists' && typeof value.hash === 'string' && contentHashPattern.test(value.hash)));
}

function file(value: unknown): value is OperationFile {
  if (!object(value) || !safeRecoveryId(value.id) || !identity(value.workspace) || typeof value.path !== 'string'
    || normalizeWorkspaceRelativePath(value.path) !== value.path || !version(value.before) || !version(value.after)
    || !object(value.snapshot) || !safeRecoveryId(value.snapshot.authorityId) || !safeRecoveryId(value.snapshot.recordId)
    || !['pending', 'committed', 'unchanged', 'unknown'].includes(value.status as string)
    || !['none', 'intent', 'restored-verified', 'blocked', 'unknown'].includes(value.undo as string)) return false;
  return (value.kind === 'create' && value.before.state === 'absent' && value.after.state === 'exists')
    || (value.kind === 'update' && value.before.state === 'exists' && value.after.state === 'exists')
    || (value.kind === 'delete' && value.before.state === 'exists' && value.after.state === 'absent');
}

export function decodeOperation(value: unknown, scope: OperationScope): OperationReceipt {
  if (!object(value) || value.schemaVersion !== 1 || !safeRecoveryId(value.operationId)
    || value.sessionId !== scope.sessionId || !identity(value.workspace)
    || value.workspace.path !== scope.workspace.path || value.workspace.identity !== scope.workspace.identity
    || typeof value.callId !== 'string' || !value.callId || value.callId.length > 512
    || (value.correlationId !== undefined && typeof value.correlationId !== 'string')
    || !Number.isSafeInteger(value.sequence) || (value.sequence as number) < 1
    || !Number.isSafeInteger(value.revision) || (value.revision as number) < 1
    || !['intent', 'committed', 'failed', 'partial', 'unknown'].includes(value.status as string)
    || !['none', 'intent', 'restored-verified', 'partial', 'unknown'].includes(value.undo as string)
    || !Array.isArray(value.files) || !value.files.length || value.files.length > 256 || !value.files.every(file)
    || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))
    || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) throw new Error('Edit operation receipt is invalid.');
  const files = value.files as OperationFile[];
  if (new Set(files.map(entry => entry.id)).size !== files.length
    || new Set(files.map(entry => `${entry.workspace.path}\0${entry.path}`)).size !== files.length
    || (value.status === 'committed' && files.some(entry => entry.status !== 'committed'))
    || (value.status === 'failed' && files.some(entry => entry.status !== 'unchanged'))
    || files.some(entry => entry.snapshot.authorityId !== value.operationId || entry.snapshot.recordId !== entry.id)
    || (value.undo === 'restored-verified' && files.some(entry => entry.undo !== 'restored-verified'))) {
    throw new Error('Edit operation receipt has inconsistent file results.');
  }
  return value as unknown as OperationReceipt;
}
