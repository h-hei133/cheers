import { hashContent } from '../../authority/content.js';
import { inspectWorkspaceFile, matchesFileState, type FileState } from '../../authority/state.js';
import { prepareRecoveryRestore, type PreparedRestore } from '../restorePrimitive.js';
import { assertOperationFile, type OperationAccess } from './access.js';
import type { OperationFile, OperationReceipt, OperationScope } from './model.js';
import { operationLedgerRoot, readOperation, readOperations } from './store.js';

export interface UndoPreviewFile {
  readonly file: OperationFile;
  readonly prepared?: PreparedRestore;
  readonly current?: FileState;
  readonly blocker?: string;
}

export interface UndoPreview {
  readonly receipt: OperationReceipt;
  readonly revision: string;
  readonly canRestore: boolean;
  readonly blockers: readonly string[];
  readonly files: readonly UndoPreviewFile[];
}

/** An unresolved newer operation is a barrier; never silently fall back to older history. */
export function latestOperation(scope: OperationScope): OperationReceipt | undefined {
  return readOperations(scope).find(receipt => receipt.undo !== 'restored-verified' && receipt.status !== 'failed' && receipt.status !== 'restored');
}

export async function previewOperation(receipt: OperationReceipt, access: OperationAccess = {}): Promise<UndoPreview> {
  const saved = readOperation(receipt, receipt.operationId);
  const blockers: string[] = [];
  if (JSON.stringify(saved) !== JSON.stringify(receipt)) blockers.push('operation-changed');
  if (receipt.status !== 'committed') blockers.push(`operation-${receipt.status === 'intent' || receipt.status === 'compensating' ? 'unknown' : receipt.status}`);
  if (receipt.undo === 'intent' || receipt.undo === 'unknown') blockers.push('undo-unknown');
  if (receipt.undo === 'restored-verified') blockers.push('already-restored');
  const files: UndoPreviewFile[] = [];
  for (const file of receipt.files) {
    try {
      assertOperationFile(receipt, file, access);
      const prepared = await prepareRecoveryRestore({ ledgerRoot: operationLedgerRoot(receipt), ...file.snapshot,
        workspaceRoot: file.workspace.path, workspaceRelativePath: file.path, abortSignal: access.abortSignal });
      const record = prepared.record;
      if (record.operation?.operationId !== receipt.operationId || record.operation.sessionId !== receipt.sessionId
        || record.operation.workspaceRoot !== file.workspace.path || record.operation.workspaceIdentity !== file.workspace.identity
        || record.beforeState !== file.before.state || record.beforeContentHash !== (file.before.state === 'exists' ? file.before.hash : undefined)
        || record.beforeMode !== (file.before.state === 'exists' ? file.before.mode : undefined)
        || record.expectedCurrentState !== file.after.state || record.expectedCurrentContentHash !== (file.after.state === 'exists' ? file.after.hash : undefined)) {
        throw new Error('Snapshot does not match the operation receipt.');
      }
      if (record.expectedCurrentMode !== (file.after.state === 'exists' ? file.after.mode : undefined)) {
        throw new Error('Snapshot does not match the operation receipt.');
      }
      assertOperationFile(receipt, file, access);
      const current = inspectWorkspaceFile(file.workspace.path, file.path, access.assertFileAccess);
      const expected = file.undo === 'restored-verified' ? file.before : file.after;
      const blocker = matchesFileState(current, expected) ? undefined : 'current-content-changed';
      files.push({ file, prepared, current, ...(blocker ? { blocker } : {}) });
      if (blocker) blockers.push(`${file.path}: ${blocker}`);
    } catch {
      files.push({ file, blocker: 'snapshot-or-workspace-unavailable' });
      blockers.push(`${file.path}: snapshot-or-workspace-unavailable`);
    }
  }
  const revision = hashContent(JSON.stringify({ receipt, files: files.map(({ file, current, blocker }) => ({ id: file.id, current, blocker })) }));
  return { receipt, files, revision, blockers, canRestore: blockers.length === 0 && files.some(entry => entry.file.undo !== 'restored-verified') };
}
