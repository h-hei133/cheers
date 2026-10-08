import fs from 'node:fs';
import path from 'node:path';
import { assertWorkspaceRoot, captureWorkspaceRoot } from '../../../core/workspace/roots.js';
import { withFileLock } from '../../../session/store/sessionFileStore.js';
import { commitWorkspaceFile } from '../../authority/commit.js';
import { hashContent } from '../../authority/content.js';
import { descriptorPath, ensureWorkspaceDirectory, inspectWorkspaceFile } from '../../authority/state.js';
import { decodeOperation } from './schema.js';
import type { EditOperationIdentity, OperationReceipt, OperationScope } from './model.js';

interface OperationIndex {
  readonly schemaVersion: 1;
  readonly sequence: number;
  readonly operations: readonly { readonly operationId: string; readonly sequence: number }[];
}

export function captureOperationScope(identity: Pick<EditOperationIdentity, 'sessionId' | 'workspaceRoot'>): OperationScope {
  if (!identity.sessionId || identity.sessionId.length > 512 || /[\x00-\x1f\x7f-\x9f]/.test(identity.sessionId)) throw new Error('Edit operation requires a session identity.');
  return { sessionId: identity.sessionId, workspace: captureWorkspaceRoot(identity.workspaceRoot, identity.workspaceRoot, 'write') };
}

export function operationLedgerRoot(scope: OperationScope): string {
  return path.join(scope.workspace.path, '.sisyphus', 'edit-snapshots');
}

function directory(scope: OperationScope): string {
  return path.join('.sisyphus', 'edit-snapshots', 'operations', hashContent(`${scope.sessionId}\0${scope.workspace.identity}`));
}

function checkScope(scope: OperationScope): void {
  assertWorkspaceRoot({ ...scope.workspace, access: 'write' });
}

function readJson(scope: OperationScope, relative: string): unknown {
  const state = inspectWorkspaceFile(scope.workspace.path, relative);
  if (state.state === 'absent') return undefined;
  if (Buffer.byteLength(state.content) > 8 * 1024 * 1024) throw new Error('Edit operation ledger exceeds its size limit.');
  return JSON.parse(state.content);
}

function readIndex(scope: OperationScope): OperationIndex {
  const value = readJson(scope, path.join(directory(scope), 'index.json')) as OperationIndex | undefined;
  if (value === undefined) {
    let files: string[] = [];
    try { files = fs.readdirSync(path.join(scope.workspace.path, directory(scope))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (files.some(file => file.endsWith('.json'))) throw new Error('Edit operation index is missing; inspect the existing receipts.');
    return { schemaVersion: 1, sequence: 0, operations: [] };
  }
  if (value.schemaVersion !== 1 || !Number.isSafeInteger(value.sequence) || value.sequence < 0 || !Array.isArray(value.operations)
    || value.operations.length > 10000 || value.operations.some(entry => !entry || typeof entry.operationId !== 'string'
      || !/^[A-Za-z0-9_-][A-Za-z0-9._-]{0,199}$/.test(entry.operationId) || !Number.isSafeInteger(entry.sequence) || entry.sequence < 1 || entry.sequence > value.sequence)
    || new Set(value.operations.map(entry => entry.operationId)).size !== value.operations.length
    || new Set(value.operations.map(entry => entry.sequence)).size !== value.operations.length) throw new Error('Edit operation index is invalid.');
  const indexed = new Set(['index.json', ...value.operations.map(entry => `${entry.operationId}.json`)]);
  const stored = fs.readdirSync(path.join(scope.workspace.path, directory(scope))).filter(name => name.endsWith('.json'));
  if (stored.length !== indexed.size || stored.some(name => !indexed.has(name))) throw new Error('Edit operation index does not account for every receipt.');
  return value;
}

export function readOperation(scope: OperationScope, operationId: string): OperationReceipt {
  checkScope(scope);
  if (!/^[A-Za-z0-9_-][A-Za-z0-9._-]{0,199}$/.test(operationId)) throw new Error('Edit operation identity is invalid.');
  const receipt = decodeOperation(readJson(scope, path.join(directory(scope), `${operationId}.json`)), scope);
  if (receipt.operationId !== operationId) throw new Error('Edit operation identity does not match its receipt.');
  return receipt;
}

/** Read-only selection never creates a ledger or adopts unowned legacy snapshots. */
export function readOperations(scope: OperationScope): readonly OperationReceipt[] {
  checkScope(scope);
  const index = readIndex(scope);
  return [...index.operations].sort((a, b) => b.sequence - a.sequence).map(entry => {
    const receipt = readOperation(scope, entry.operationId);
    if (receipt.sequence !== entry.sequence) throw new Error('Edit operation order is inconsistent.');
    return receipt;
  });
}

export function persistOperation(receipt: OperationReceipt): void {
  checkScope(receipt);
  decodeOperation(receipt, receipt);
  const relative = path.join(directory(receipt), `${receipt.operationId}.json`);
  const before = inspectWorkspaceFile(receipt.workspace.path, relative);
  if (before.state === 'exists') {
    const previous = decodeOperation(JSON.parse(before.content), receipt);
    const immutable = (value: OperationReceipt) => JSON.stringify({ ...value, revision: 0, status: '', undo: '', updatedAt: '',
      files: value.files.map(file => ({ ...file, status: '', undo: '' })) });
    if (receipt.revision !== previous.revision + 1 || immutable(receipt) !== immutable(previous)) throw new Error('Edit operation receipt changed before publication.');
  } else if (receipt.revision !== 1) throw new Error('Edit operation receipt disappeared before publication.');
  const text = JSON.stringify(receipt);
  commitWorkspaceFile({ workspaceRoot: receipt.workspace.path, relativePath: relative, expected: before, content: text });
  if (inspectWorkspaceFile(receipt.workspace.path, relative).state !== 'exists'
    || JSON.stringify(readOperation(receipt, receipt.operationId)) !== text) throw new Error('Edit operation receipt could not be verified.');
}

/** The callback is synchronous: no lock is released while a writer is outstanding. */
export function withOperationStore<T>(scope: OperationScope, action: () => T): T {
  checkScope(scope);
  const relative = directory(scope);
  ensureWorkspaceDirectory(scope.workspace.path, relative);
  const absolute = path.join(scope.workspace.path, relative);
  const fd = fs.openSync(absolute, fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY ?? 0) | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    if (descriptorPath(fd, absolute) !== absolute) throw new Error('Edit operation store changed path.');
    const lockPath = path.join(process.platform === 'linux' ? `/proc/self/fd/${fd}` : absolute, 'store.lock');
    return withFileLock(lockPath, () => {
      checkScope(scope);
      inspectWorkspaceFile(scope.workspace.path, path.join(relative, 'index.json'));
      return action();
    }, { recovery: 'local-dead', createParent: false });
  } finally { fs.closeSync(fd); }
}

export function allocateOperation(input: Omit<OperationReceipt, 'sequence'>): OperationReceipt {
  const index = readIndex(input);
  if (index.operations.length >= 10000 || index.sequence >= Number.MAX_SAFE_INTEGER) throw new Error('Edit operation ledger is full.');
  if (index.operations.some(entry => entry.operationId === input.operationId)) throw new Error('Edit operation already exists; it cannot be replayed.');
  const receipt: OperationReceipt = { ...input, sequence: index.sequence + 1 };
  persistOperation(receipt);
  const next: OperationIndex = { schemaVersion: 1, sequence: receipt.sequence, operations: [...index.operations, { operationId: receipt.operationId, sequence: receipt.sequence }] };
  const relative = path.join(directory(input), 'index.json');
  commitWorkspaceFile({ workspaceRoot: input.workspace.path, relativePath: relative,
    expected: inspectWorkspaceFile(input.workspace.path, relative), content: JSON.stringify(next) });
  if (JSON.stringify(readIndex(input)) !== JSON.stringify(next)) throw new Error('Edit operation order could not be verified.');
  return receipt;
}
