import { assertWorkspaceRoot } from '../../../core/workspace/roots.js';
import { commitWorkspaceFile } from '../../authority/commit.js';
import { inspectWorkspaceFile, matchesFileState, type FileState } from '../../authority/state.js';
import type { OperationReceipt, PreparedOperation } from './model.js';
import { persistOperation } from './store.js';

/** Caller retains the complete target locks and store lock. Only verified publications are compensated. */
export function compensateOperation(prepared: PreparedOperation, receipt: OperationReceipt, written: ReadonlyMap<number, FileState>): OperationReceipt {
  receipt = { ...receipt, status: 'compensating', revision: receipt.revision + 1,
    files: receipt.files.map((file, index) => written.has(index) ? { ...file, compensation: 'intent' } : file), updatedAt: new Date().toISOString() };
  persistOperation(receipt);
  for (const [index, expected] of [...written.entries()].reverse()) {
    const { input } = prepared.files[index]!;
    const file = receipt.files[index]!;
    let outcome: 'restored-verified' | 'blocked' | 'unknown' = 'blocked';
    let started = false;
    try {
      assertWorkspaceRoot({ ...file.workspace, access: 'write' });
      const current = inspectWorkspaceFile(input.workspaceRoot, input.relativePath, input.assertFileAccess, input.maxBytes);
      if (matchesFileState(current, expected)) {
        started = true;
        commitWorkspaceFile({ ...input, expected, content: input.before.state === 'exists' ? input.before.content : undefined,
          mode: input.before.state === 'exists' ? input.before.mode & 0o777 : undefined,
          assertFileAccess: absolute => { assertWorkspaceRoot({ ...file.workspace, access: 'write' }); input.assertFileAccess?.(absolute); } });
        outcome = 'restored-verified';
      }
    } catch { outcome = started ? 'unknown' : 'blocked'; }
    receipt = { ...receipt, revision: receipt.revision + 1, updatedAt: new Date().toISOString(),
      files: receipt.files.map((file, at) => at === index ? { ...file, compensation: outcome } : file) };
    persistOperation(receipt);
  }
  const unknown = receipt.files.some(file => file.status === 'unknown' || file.compensation === 'unknown');
  const incomplete = receipt.files.some(file => file.status === 'committed' && file.compensation !== 'restored-verified');
  receipt = { ...receipt, status: unknown ? 'unknown' : incomplete ? 'partial' : 'restored', revision: receipt.revision + 1, updatedAt: new Date().toISOString() };
  persistOperation(receipt);
  return receipt;
}
