import { createHash } from 'node:crypto';
import { inspectWorkspaceFile, matchesFileState, type FileState } from '../../authority/state.js';
import { prepareRecoveryRestore, type PreparedRestore } from '../restorePrimitive.js';
import { assertOperationFile, type OperationAccess } from './access.js';
import type { OperationFile, OperationReceipt, OperationScope } from './model.js';
import { operationLedgerRoot, readOperation, scanOperations } from './store.js';
import { RecoveryReadControlError, RecoveryReadLimitError, recoveryReadBudget } from '../read.js';
import { UNDO_PREVIEW_LIMITS } from './limits.js';

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
  let latest: OperationReceipt | undefined;
  // Older receipts still participate in validation and the shared read budget.
  for (const receipt of scanOperations(scope)) {
    if (!latest && receipt.undo !== 'restored-verified' && receipt.status !== 'failed' && receipt.status !== 'restored') latest = receipt;
  }
  return latest;
}

export async function previewOperation(receipt: OperationReceipt, access: OperationAccess = {}): Promise<UndoPreview> {
  const saved = readOperation(receipt, receipt.operationId);
  const blockers: string[] = [];
  if (JSON.stringify(saved) !== JSON.stringify(receipt)) blockers.push('operation-changed');
  if (receipt.status !== 'committed') blockers.push(`operation-${receipt.status === 'intent' || receipt.status === 'compensating' ? 'unknown' : receipt.status}`);
  if (receipt.undo === 'intent' || receipt.undo === 'unknown') blockers.push('undo-unknown');
  if (receipt.undo === 'restored-verified') blockers.push('already-restored');
  const files: UndoPreviewFile[] = [];
  const budget = recoveryReadBudget(UNDO_PREVIEW_LIMITS.totalBytes, access.abortSignal, access.admission);
  const previewAccess: OperationAccess = { ...access, admission: () => { budget.check(); return undefined; } };
  for (const file of receipt.files) {
    budget.check();
    try {
      assertOperationFile(receipt, file, previewAccess);
      const prepared = await prepareRecoveryRestore({ ledgerRoot: operationLedgerRoot(receipt), ...file.snapshot,
        workspaceRoot: file.workspace.path, workspaceRelativePath: file.path, abortSignal: access.abortSignal, readAccess: budget });
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
      assertOperationFile(receipt, file, previewAccess);
      const current = inspectWorkspaceFile(file.workspace.path, file.path, access.assertFileAccess, UNDO_PREVIEW_LIMITS.fileBytes, budget.admit);
      const expected = file.undo === 'restored-verified' ? file.before : file.after;
      const blocker = matchesFileState(current, expected) ? undefined : 'current-content-changed';
      files.push({ file, prepared, current, ...(blocker ? { blocker } : {}) });
      if (blocker) blockers.push(`${file.path}: ${blocker}`);
    } catch (error) {
      budget.check();
      if (error instanceof RecoveryReadControlError) throw error;
      if (error instanceof RecoveryReadLimitError) {
        files.length = 0;
        files.push(...receipt.files.map(file => ({ file, blocker: 'preview-source-limit' })));
        blockers.push('preview-source-limit');
        break;
      }
      files.push({ file, blocker: 'snapshot-or-workspace-unavailable' });
      blockers.push(`${file.path}: snapshot-or-workspace-unavailable`);
    }
  }
  budget.check();
  const digest = createHash('sha256').update(`{"receipt":${JSON.stringify(receipt)},"files":[`);
  for (let index = 0; index < files.length; index++) {
    if (index) digest.update(',');
    const { file, current, blocker } = files[index]!;
    digest.update(JSON.stringify({ id: file.id, current, blocker }));
  }
  const revision = digest.update(']}').digest('hex');
  return { receipt, files, revision, blockers, canRestore: blockers.length === 0 && files.some(entry => entry.file.undo !== 'restored-verified') };
}
