import path from 'node:path';
import { withFileLocks } from '../../../runtime/execution/fileLock.js';
import { commitWorkspaceFile } from '../../authority/commit.js';
import { inspectWorkspaceFile, matchesFileState } from '../../authority/state.js';
import { assertOperationFile, type OperationAccess } from './access.js';
import type { OperationFile, OperationReceipt } from './model.js';
import { latestOperation, previewOperation, type UndoPreview } from './preview.js';
import { persistOperation, readOperation, withOperationStore } from './store.js';

export interface UndoApproval {
  readonly operationId: string;
  readonly sessionId: string;
  readonly workspaceIdentity: string;
  readonly revision: string;
}

export interface UndoResult {
  readonly status: 'denied' | 'blocked' | 'restored-verified' | 'partial' | 'unknown';
  readonly operationId: string;
  readonly files: readonly { readonly path: string; readonly status: OperationFile['undo'] }[];
}

/** Explicit approval binds the complete preview. An interrupted intent never replays automatically. */
export async function restoreOperation(preview: UndoPreview, approval: UndoApproval | undefined, access: OperationAccess = {}): Promise<UndoResult> {
  const original = preview.receipt;
  if (!approval || approval.operationId !== original.operationId || approval.sessionId !== original.sessionId
    || approval.workspaceIdentity !== original.workspace.identity || approval.revision !== preview.revision) return result('denied', original);
  if (!preview.canRestore) return result('blocked', original);
  let receipt = original;
  let intended = false;
  try {
    // Read and verify blobs again after approval, then take every shared file lock.
    const refreshed = await previewOperation(readOperation(original, original.operationId), access);
    if (!refreshed.canRestore || refreshed.revision !== preview.revision) return result('blocked', original);
    return await withFileLocks(refreshed.files.map(entry => path.join(entry.file.workspace.path, entry.file.path)), async () => withOperationStore(original, () => {
      if (latestOperation(original)?.operationId !== original.operationId || JSON.stringify(readOperation(original, original.operationId)) !== JSON.stringify(original)) {
        return result('blocked', original);
      }
      for (const entry of refreshed.files) {
        assertOperationFile(original, entry.file, access);
        const current = inspectWorkspaceFile(entry.file.workspace.path, entry.file.path, access.assertFileAccess);
        if (!entry.current || !matchesFileState(current, entry.current)) return result('blocked', original);
      }
      receipt = { ...original, undo: 'intent', revision: original.revision + 1,
        files: original.files.map(file => file.undo === 'restored-verified' ? file : { ...file, undo: 'intent' }), updatedAt: new Date().toISOString() };
      // Even failure of this publication is uncertain until the saved receipt is reread.
      intended = true;
      persistOperation(receipt);
      for (const entry of refreshed.files) {
        if (entry.file.undo === 'restored-verified') continue;
        let started = false;
        try {
          assertOperationFile(original, entry.file, access);
          started = true;
          commitWorkspaceFile({ workspaceRoot: entry.file.workspace.path, relativePath: entry.file.path,
            expected: entry.current!, content: entry.prepared!.content,
            assertFileAccess: absolute => { assertOperationFile(original, entry.file, access); access.assertFileAccess?.(absolute); } });
          receipt = updateFile(receipt, entry.file.id, 'restored-verified');
          persistOperation(receipt);
        } catch {
          receipt = updateFile(receipt, entry.file.id, started ? 'unknown' : 'blocked');
          receipt = { ...receipt, undo: started ? 'unknown' : receipt.files.some(file => file.undo === 'restored-verified') ? 'partial' : 'none' };
          // Unattempted files retain their prior state, so a fresh explicit preview can show them.
          receipt = { ...receipt, files: receipt.files.map(file => file.undo === 'intent' ? { ...file, undo: 'none' } : file) };
          persistOperation(receipt);
          return result(receipt.undo === 'unknown' ? 'unknown' : receipt.undo === 'partial' ? 'partial' : 'blocked', receipt);
        }
      }
      receipt = { ...receipt, undo: 'restored-verified', revision: receipt.revision + 1, updatedAt: new Date().toISOString() };
      persistOperation(receipt);
      return result('restored-verified', receipt);
    }));
  } catch { return result(intended ? 'unknown' : 'blocked', receipt); }
}

function updateFile(receipt: OperationReceipt, id: string, undo: OperationFile['undo']): OperationReceipt {
  return { ...receipt, revision: receipt.revision + 1, updatedAt: new Date().toISOString(), files: receipt.files.map(file => file.id === id ? { ...file, undo } : file) };
}

function result(status: UndoResult['status'], receipt: OperationReceipt): UndoResult {
  return { status, operationId: receipt.operationId, files: receipt.files.map(file => ({ path: file.path, status: file.undo })) };
}
