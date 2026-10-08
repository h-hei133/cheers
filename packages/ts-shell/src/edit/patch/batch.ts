import path from 'node:path';
import { assertWorkspaceRoot } from '../../core/workspace/roots.js';
import { withFileLocks } from '../../runtime/execution/fileLock.js';
import { inspectWorkspaceFile, matchesFileState } from '../authority/state.js';
import { commitOperation, prepareOperation } from '../recovery/operation/write.js';
import type { EditOperationIdentity, OperationReceipt } from '../recovery/operation/model.js';
import type { PatchPlan } from './plan.js';

export async function applyPatchPlan(plan: PatchPlan, identity: EditOperationIdentity, access: {
  readonly assertFileAccess?: (absolutePath: string) => void;
  readonly abortSignal?: AbortSignal;
} = {}): Promise<OperationReceipt | undefined> {
  if (identity.sessionId !== plan.scope.sessionId || path.resolve(identity.workspaceRoot) !== plan.scope.workspace.path) throw new Error('Patch approval belongs to another session or workspace.');
  if (!plan.files.length) return undefined;
  return withFileLocks(plan.files.map(file => path.join(file.workspaceRoot, file.relativePath)), async () => {
    assertWorkspaceRoot({ ...plan.scope.workspace, access: 'write' });
    const files = plan.files.map(file => ({ ...file, assertFileAccess: (absolute: string) => {
      access.abortSignal?.throwIfAborted();
      assertWorkspaceRoot({ path: file.workspaceRoot, identity: file.workspaceIdentity!, access: 'write' });
      access.assertFileAccess?.(absolute);
    } }));
    for (const file of files) {
      if (!matchesFileState(inspectWorkspaceFile(file.workspaceRoot, file.relativePath, file.assertFileAccess), file.before)) throw new Error('Patch changed after approval. Nothing was written.');
    }
    const prepared = await prepareOperation(identity, files);
    access.abortSignal?.throwIfAborted();
    return commitOperation(prepared, { compensate: true });
  });
}
