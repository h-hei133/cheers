import path from 'node:path';
import type { WorkspaceRoot } from '../../../core/workspace/model.js';
import { assertWorkspaceRoot, selectWorkspaceRoot } from '../../../core/workspace/roots.js';
import type { OperationFile, OperationScope } from './model.js';

export interface OperationAccess {
  readonly workspaceRoots?: readonly WorkspaceRoot[];
  readonly assertFileAccess?: (absolutePath: string) => void;
  readonly abortSignal?: AbortSignal;
  readonly admission?: () => string | undefined;
}

export function assertOperationFile(scope: OperationScope, file: OperationFile, access: OperationAccess): void {
  access.abortSignal?.throwIfAborted();
  const blocked = access.admission?.();
  if (blocked) throw new Error(blocked);
  assertWorkspaceRoot({ ...scope.workspace, access: 'write' });
  const absolute = path.resolve(file.workspace.path, file.path);
  const selected = selectWorkspaceRoot(scope.workspace.path, access.workspaceRoots ?? [], absolute, 'write');
  if (selected !== file.workspace.path) throw new Error('Edit operation workspace grant changed.');
  assertWorkspaceRoot({ ...file.workspace, access: 'write' });
  access.assertFileAccess?.(absolute);
}
