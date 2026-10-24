import fs from 'node:fs';
import path from 'node:path';
import { assertWorkspaceRoot, captureWorkspaceRoot } from '../../../core/workspace/roots.js';
import { withFileLock } from '../../../session/store/sessionFileStore.js';
import { commitWorkspaceFile } from '../../authority/commit.js';
import { hashContent } from '../../authority/content.js';
import { descriptorPath, ensureWorkspaceDirectory, inspectWorkspaceFile, workspaceFilePath } from '../../authority/state.js';
import { decodeOperation } from './schema.js';
import { OPERATION_READ_LIMITS } from './limits.js';
import type { EditOperationIdentity, OperationReceipt, OperationScope } from './model.js';
import { assertProfileStorage, captureProfileIdentity, currentProfile } from '../../../core/paths/profile/context.js';
import { snapshotRoot } from '../root.js';

interface OperationIndex {
  readonly schemaVersion: 1;
  readonly sequence: number;
  readonly operations: readonly { readonly operationId: string; readonly sequence: number }[];
}

export function captureOperationScope(identity: Pick<EditOperationIdentity, 'sessionId' | 'workspaceRoot'>): OperationScope {
  if (!identity.sessionId || identity.sessionId.length > 512 || /[\x00-\x1f\x7f-\x9f]/.test(identity.sessionId)) throw new Error('Edit operation requires a session identity.');
  const profile = captureProfileIdentity();
  return { sessionId: identity.sessionId, workspace: captureWorkspaceRoot(identity.workspaceRoot, identity.workspaceRoot, 'write'), ...(profile ? { profile } : {}) };
}

export function operationLedgerRoot(scope: OperationScope): string {
  storageRoot(scope);
  return snapshotRoot(scope.workspace.path, scope.profile);
}

function directory(scope: OperationScope): string {
  return path.join(path.relative(storageRoot(scope), operationLedgerRoot(scope)), 'operations', hashContent(`${scope.sessionId}\0${scope.workspace.identity}`));
}

function storageRoot(scope: OperationScope): string {
  if (!scope.profile && currentProfile()?.id !== undefined && currentProfile()?.id !== 'default') throw new Error('Edit operation is missing its profile identity.');
  return scope.profile?.root ?? scope.workspace.path;
}

function checkScope(scope: OperationScope): void {
  assertWorkspaceRoot({ ...scope.workspace, access: 'write' });
  assertProfileStorage(storageRoot(scope), scope.profile);
}

interface ReadBudget { bytes: number; files: number }

function readJson(scope: OperationScope, relative: string, budget?: ReadBudget): unknown {
  const root = storageRoot(scope);
  assertProfileStorage(path.join(root, relative), scope.profile);
  const maxBytes = Math.min(OPERATION_READ_LIMITS.jsonBytes, budget ? OPERATION_READ_LIMITS.totalBytes - budget.bytes : OPERATION_READ_LIMITS.jsonBytes);
  const state = inspectWorkspaceFile(root, relative, undefined, maxBytes);
  if (state.state === 'absent') return undefined;
  if (budget) budget.bytes += Buffer.byteLength(state.content, 'utf8');
  return JSON.parse(state.content);
}

/** Undo scans bound all names; writer inventory keeps its existing acceptance semantics. */
function inventory(scope: OperationScope, bounded = false): Set<string> {
  const absolute = path.dirname(workspaceFilePath(storageRoot(scope), path.join(directory(scope), '.inventory')));
  let fd: number;
  try { fd = fs.openSync(absolute, fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY ?? 0) | (fs.constants.O_NOFOLLOW ?? 0)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Set(); throw error; }
  try {
    if (!fs.fstatSync(fd).isDirectory() || descriptorPath(fd, absolute) !== absolute) throw new Error('Edit operation store changed path.');
    const cursor = fs.opendirSync(process.platform === 'linux' ? `/proc/self/fd/${fd}` : absolute, { bufferSize: 32 });
    const names = new Set<string>();
    try {
      let count = 0;
      for (let entry = cursor.readSync(); entry; entry = cursor.readSync()) {
        if (++count > OPERATION_READ_LIMITS.directoryEntries && bounded) throw new Error('Edit operation directory exceeds its entry limit.');
        if (entry.name.endsWith('.json')) names.add(entry.name);
      }
      if (descriptorPath(fd, absolute) !== absolute) throw new Error('Edit operation store changed path.');
      return names;
    } finally { cursor.closeSync(); }
  } finally { fs.closeSync(fd); }
}

function readIndex(scope: OperationScope, budget?: ReadBudget): OperationIndex {
  const value = readJson(scope, path.join(directory(scope), 'index.json'), budget) as OperationIndex | undefined;
  if (value === undefined) {
    if (inventory(scope, budget !== undefined).size) throw new Error('Edit operation index is missing; inspect the existing receipts.');
    return { schemaVersion: 1, sequence: 0, operations: [] };
  }
  if (value.schemaVersion !== 1 || !Number.isSafeInteger(value.sequence) || value.sequence < 0 || !Array.isArray(value.operations)
    || value.operations.length > 10000 || value.operations.some(entry => !entry || typeof entry.operationId !== 'string'
      || !/^[A-Za-z0-9_-][A-Za-z0-9._-]{0,199}$/.test(entry.operationId) || !Number.isSafeInteger(entry.sequence) || entry.sequence < 1 || entry.sequence > value.sequence)
    || new Set(value.operations.map(entry => entry.operationId)).size !== value.operations.length
    || new Set(value.operations.map(entry => entry.sequence)).size !== value.operations.length) throw new Error('Edit operation index is invalid.');
  const indexed = new Set(['index.json', ...value.operations.map(entry => `${entry.operationId}.json`)]);
  const stored = inventory(scope, budget !== undefined);
  if (stored.size !== indexed.size || [...stored].some(name => !indexed.has(name))) throw new Error('Edit operation index does not account for every receipt.');
  return value;
}

export function readOperation(scope: OperationScope, operationId: string): OperationReceipt {
  return readReceipt(scope, operationId);
}

function readReceipt(scope: OperationScope, operationId: string, budget?: ReadBudget): OperationReceipt {
  checkScope(scope);
  if (!/^[A-Za-z0-9_-][A-Za-z0-9._-]{0,199}$/.test(operationId)) throw new Error('Edit operation identity is invalid.');
  const receipt = decodeOperation(readJson(scope, path.join(directory(scope), `${operationId}.json`), budget), scope);
  if (receipt.operationId !== operationId) throw new Error('Edit operation identity does not match its receipt.');
  if (budget) {
    budget.files += receipt.files.length;
    if (budget.files > OPERATION_READ_LIMITS.files) throw new Error('Edit operation history exceeds its file limit.');
  }
  return receipt;
}

/** Read-only selection never creates a ledger or adopts unowned legacy snapshots. */
export function readOperations(scope: OperationScope): readonly OperationReceipt[] {
  return [...scanOperations(scope)];
}

/** Decode one receipt at a time while sharing the complete scan's read budget. */
export function* scanOperations(scope: OperationScope): Generator<OperationReceipt> {
  checkScope(scope);
  const budget: ReadBudget = { bytes: 0, files: 0 };
  const index = readIndex(scope, budget);
  for (const entry of [...index.operations].sort((a, b) => b.sequence - a.sequence)) {
    const receipt = readReceipt(scope, entry.operationId, budget);
    if (receipt.sequence !== entry.sequence) throw new Error('Edit operation order is inconsistent.');
    yield receipt;
  }
}

export function persistOperation(receipt: OperationReceipt): void {
  checkScope(receipt);
  decodeOperation(receipt, receipt);
  const relative = path.join(directory(receipt), `${receipt.operationId}.json`);
  const root = storageRoot(receipt);
  assertProfileStorage(path.join(root, relative), receipt.profile);
  const before = inspectWorkspaceFile(root, relative);
  if (before.state === 'exists') {
    const previous = decodeOperation(JSON.parse(before.content), receipt);
    const immutable = (value: OperationReceipt) => JSON.stringify({ ...value, revision: 0, status: '', undo: '', updatedAt: '',
      files: value.files.map(file => ({ ...file, status: '', undo: '', compensation: '' })) });
    if (receipt.revision !== previous.revision + 1 || immutable(receipt) !== immutable(previous)) throw new Error('Edit operation receipt changed before publication.');
  } else if (receipt.revision !== 1) throw new Error('Edit operation receipt disappeared before publication.');
  const text = JSON.stringify(receipt);
  commitWorkspaceFile({ workspaceRoot: root, relativePath: relative, expected: before, content: text });
  assertProfileStorage(path.join(root, relative), receipt.profile);
  if (inspectWorkspaceFile(root, relative).state !== 'exists'
    || JSON.stringify(readOperation(receipt, receipt.operationId)) !== text) throw new Error('Edit operation receipt could not be verified.');
}

/** The callback is synchronous: no lock is released while a writer is outstanding. */
export function withOperationStore<T>(scope: OperationScope, action: () => T): T {
  checkScope(scope);
  const relative = directory(scope);
  const root = storageRoot(scope);
  ensureWorkspaceDirectory(root, relative);
  const absolute = path.join(root, relative);
  assertProfileStorage(absolute, scope.profile);
  const fd = fs.openSync(absolute, fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY ?? 0) | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    if (descriptorPath(fd, absolute) !== absolute) throw new Error('Edit operation store changed path.');
    const lockPath = path.join(process.platform === 'linux' ? `/proc/self/fd/${fd}` : absolute, 'store.lock');
    return withFileLock(lockPath, () => {
      checkScope(scope);
      assertProfileStorage(path.join(absolute, 'store.lock'), scope.profile);
      inspectWorkspaceFile(root, path.join(relative, 'index.json'));
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
  const root = storageRoot(input);
  commitWorkspaceFile({ workspaceRoot: root, relativePath: relative,
    expected: inspectWorkspaceFile(root, relative), content: JSON.stringify(next) });
  if (JSON.stringify(readIndex(input)) !== JSON.stringify(next)) throw new Error('Edit operation order could not be verified.');
  return receipt;
}
