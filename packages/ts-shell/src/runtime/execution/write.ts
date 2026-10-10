import { realpathSync } from 'node:fs';
import path from 'node:path';
import { verifyPathContainment } from '../../core/security/pathJail.js';
import { commitWorkspaceFile } from '../../edit/authority/commit.js';
import { inspectWorkspaceFile } from '../../edit/authority/state.js';
import { buildEditSnapshotStoreConfig } from '../../edit/recovery/editSnapshot.js';
import { captureRecoveryAuthorityRecord } from '../../edit/recovery/recoveryAuthorityStore.js';
import { commitOperation, prepareOperation } from '../../edit/recovery/operation/write.js';
import { FileContentConflictError } from './conflict.js';
import { withFileLock } from './fileLock.js';
import type { TextFileWriteExecutionRequest, TextFileWriteResult } from './types.js';

export function writeTextFile(request: TextFileWriteExecutionRequest): Promise<TextFileWriteResult> {
  return withFileLock(request.absolutePath, () => writeUnlocked(request));
}

async function writeUnlocked(request: TextFileWriteExecutionRequest): Promise<TextFileWriteResult> {
  request.abortSignal?.throwIfAborted();
  if (request.authority.mode !== 'approved-for-write') throw new Error('File write requires approved write authority.');
  const root = realpathSync(request.workspaceRoot);
  const checked = verifyPathContainment(request.absolutePath, request.workspaceRoot);
  if (!checked.allowed) throw new Error('Write target is outside the selected workspace.');
  const lexical = path.relative(path.resolve(request.workspaceRoot), request.absolutePath);
  const relative = lexical === '..' || lexical.startsWith(`..${path.sep}`) || path.isAbsolute(lexical)
    ? path.relative(root, checked.resolvedPath) : lexical;
  const checkAccess = (absolute: string): void => {
    request.abortSignal?.throwIfAborted();
    if (!verifyPathContainment(absolute, root).allowed) throw new Error('Write target is outside the selected workspace.');
    request.assertFileAccess?.(absolute);
  };
  const before = inspectWorkspaceFile(root, relative, checkAccess);
  if (request.expectedContent !== undefined && (before.state !== 'exists' || before.content !== request.expectedContent)) {
    throw new FileContentConflictError(request.reportSafeTarget);
  }
  if (before.state === 'exists' && before.content === request.content) return { status: 'unchanged' };
  const input = { workspaceRoot: root, relativePath: relative, before, content: request.content, assertFileAccess: checkAccess };
  if (request.editIdentity) {
    const prepared = await prepareOperation(request.editIdentity, [input]);
    // Snapshot persistence yields. Refuse stale input before publishing a write intent.
    checkCondition(request, root, relative, before, checkAccess);
    const receipt = commitOperation(prepared);
    return { status: 'committed', operationId: receipt.operationId };
  }
  // Legacy non-session callers retain best-effort snapshot capture, without being
  // admitted to a session's undo stack. A snapshot is never commit evidence.
  try {
    await captureRecoveryAuthorityRecord({ ...buildEditSnapshotStoreConfig({ workspaceRoot: root, targetPath: relative }),
      recordId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      workspaceRelativePath: relative, operationKind: before.state === 'absent' ? 'create' : 'update',
      beforeState: before.state, ...(before.state === 'exists' ? { beforeContent: before.content } : {}),
      expectedCurrentState: 'exists', expectedCurrentContent: request.content });
  } catch { /* Unowned snapshots remain optional. */ }
  checkCondition(request, root, relative, before, checkAccess);
  commitWorkspaceFile({ ...input, expected: before });
  return { status: 'committed' };
}

function checkCondition(request: TextFileWriteExecutionRequest, root: string, relative: string,
  before: ReturnType<typeof inspectWorkspaceFile>, checkAccess: (absolute: string) => void): void {
  const current = inspectWorkspaceFile(root, relative, checkAccess);
  if (current.state !== before.state || (current.state === 'exists' && before.state === 'exists'
    && (current.content !== before.content || current.identity !== before.identity))) {
    throw new FileContentConflictError(request.reportSafeTarget);
  }
}
