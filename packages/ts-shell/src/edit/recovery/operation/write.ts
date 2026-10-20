import { randomUUID } from 'node:crypto';
import { assertWorkspaceRoot, captureWorkspaceRoot } from '../../../core/workspace/roots.js';
import { commitWorkspaceFile } from '../../authority/commit.js';
import { hashContent } from '../../authority/content.js';
import { inspectWorkspaceFile, matchesFileState, type FileState } from '../../authority/state.js';
import { captureRecoveryAuthorityRecord } from '../recoveryAuthorityStore.js';
import { compensateOperation } from './compensation.js';
import { allocateOperation, captureOperationScope, operationLedgerRoot, persistOperation, withOperationStore } from './store.js';
import type { EditOperationIdentity, OperationFile, OperationReceipt, PreparedFile, PreparedOperation } from './model.js';
export type { PreparedFile, PreparedOperation } from './model.js';

export class EditOperationError extends Error {
  constructor(readonly operationId: string, readonly status: OperationReceipt['status'] | 'unknown') {
    super(`File edit ${operationId}: ${status}. Inspect the operation receipt before retrying; a write may have occurred.`);
    this.name = 'EditOperationError';
  }
}

export async function prepareOperation(identity: EditOperationIdentity, inputs: readonly PreparedFile[]): Promise<PreparedOperation> {
  const scope = captureOperationScope(identity);
  const operationId = `op-${randomUUID()}`;
  const files: { input: PreparedFile; receipt: OperationFile }[] = [];
  for (const input of inputs) {
    const workspace = captureWorkspaceRoot(input.workspaceRoot, input.workspaceRoot, 'write');
    if (input.workspaceIdentity !== undefined && workspace.identity !== input.workspaceIdentity) throw new Error('Edit workspace changed after approval.');
    const id = `file-${files.length + 1}`;
    const before = input.before;
    const mode = input.content === undefined ? undefined : input.mode ?? (before.state === 'exists' ? before.mode & 0o777 : 0o666 & ~process.umask());
    const snapshot = await captureRecoveryAuthorityRecord({
      mode: 'non-default', ledgerRoot: operationLedgerRoot(scope), authorityId: operationId,
      recordId: id, workspaceRelativePath: input.relativePath,
      operation: { operationId, sessionId: identity.sessionId, workspaceRoot: workspace.path, workspaceIdentity: workspace.identity },
      operationKind: input.content === undefined ? 'delete' : before.state === 'absent' ? 'create' : 'update',
      beforeState: before.state, ...(before.state === 'exists' ? { beforeContent: before.content, beforeMode: before.mode & 0o777 } : {}),
      expectedCurrentState: input.content === undefined ? 'absent' : 'exists',
      ...(input.content === undefined ? {} : { expectedCurrentContent: input.content, expectedCurrentMode: mode }),
    });
    if (snapshot?.status !== 'captured') throw new Error('Edit snapshot could not be saved. Nothing was written.');
    files.push({ input: { ...input, mode }, receipt: {
      id, workspace,
      path: input.relativePath, kind: input.content === undefined ? 'delete' : before.state === 'absent' ? 'create' : 'update',
      before: before.state === 'absent' ? { state: 'absent' } : { state: 'exists', hash: before.hash, mode: before.mode & 0o777 },
      after: input.content === undefined ? { state: 'absent' } : { state: 'exists', hash: hashContent(input.content), mode },
      snapshot: { authorityId: operationId, recordId: id }, status: 'pending', undo: 'none',
      ...(input.rename ? { rename: input.rename } : {}),
    } });
  }
  return { scope, identity, operationId, files };
}

/** Intents and file verification use one synchronous store critical section, in actual write order. */
export function commitOperation(prepared: PreparedOperation, options: { readonly compensate?: boolean } = {}): OperationReceipt {
  let receipt: OperationReceipt | undefined;
  try {
    return withOperationStore(prepared.scope, () => {
      for (const { input, receipt: file } of prepared.files) {
        assertWorkspaceRoot({ ...file.workspace, access: 'write' });
        if (!matchesFileState(inspectWorkspaceFile(input.workspaceRoot, input.relativePath, input.assertFileAccess, input.maxBytes), input.before)) {
          throw new Error('Edit batch changed before any target write.');
        }
      }
      const now = new Date().toISOString();
      receipt = allocateOperation({ ...prepared.scope, schemaVersion: 1, operationId: prepared.operationId,
        callId: prepared.identity.callId, correlationId: prepared.identity.correlationId,
        ...(prepared.identity.selection ? { selection: prepared.identity.selection } : {}),
        revision: 1, status: 'intent', undo: 'none', files: prepared.files.map(file => file.receipt), createdAt: now, updatedAt: now });
      const files = [...receipt.files];
      const written = new Map<number, FileState>();
      for (let index = 0; index < prepared.files.length; index++) {
        const input = prepared.files[index]!.input;
        try {
          const workspace = files[index]!.workspace;
          assertWorkspaceRoot({ ...workspace, access: 'write' });
          const after = commitWorkspaceFile({ ...input, expected: input.before, assertFileAccess: absolute => {
            assertWorkspaceRoot({ ...workspace, access: 'write' });
            input.assertFileAccess?.(absolute);
          } });
          written.set(index, after);
          files[index] = { ...files[index]!, status: 'committed' };
        } catch {
          let unchanged = false;
          try { unchanged = matchesFileState(inspectWorkspaceFile(input.workspaceRoot, input.relativePath, input.assertFileAccess, input.maxBytes), input.before); }
          catch { /* The writer outcome remains unknown when inspection is unavailable. */ }
          files[index] = { ...files[index]!, status: unchanged ? 'unchanged' : 'unknown' };
          for (let remaining = index + 1; remaining < files.length; remaining++) files[remaining] = { ...files[remaining]!, status: 'unchanged' };
          receipt = { ...receipt!, revision: receipt!.revision + 1, files,
            status: files.some(file => file.status === 'unknown') ? 'unknown' : files.some(file => file.status === 'committed') ? 'partial' : 'failed',
            updatedAt: new Date().toISOString() };
          persistOperation(receipt);
          if (options.compensate && written.size) receipt = compensateOperation(prepared, receipt, written);
          throw new EditOperationError(receipt.operationId, receipt.status);
        }
        receipt = { ...receipt!, files: [...files], revision: receipt!.revision + 1, updatedAt: new Date().toISOString() };
        persistOperation(receipt);
      }
      receipt = { ...receipt!, status: 'committed', revision: receipt!.revision + 1, updatedAt: new Date().toISOString() };
      persistOperation(receipt);
      return receipt;
    });
  } catch (error) {
    if (error instanceof EditOperationError) throw error;
    if (receipt) throw new EditOperationError(receipt.operationId, 'unknown');
    throw error;
  }
}
