import { createDefaultExecutionService, type ExecutionService } from '../../runtime/execution/service.js';
import { digest, exactFile, snapshotFile } from './source.js';

export async function readSecurityInput(root: string, selected: string, sourceAccess?: (absolute: string) => void,
  execution: Pick<ExecutionService, 'readTextFile'> = createDefaultExecutionService()): Promise<string> {
  const absolute = exactFile(root, selected); sourceAccess?.(absolute); const before = snapshotFile(absolute, 4 * 1024 * 1024, false).snapshot;
  const text = await execution.readTextFile({ operationKind: 'file.read', absolutePath: absolute, workspaceRoot: root,
    maxBytes: 4 * 1024 * 1024,
    assertFileAccess: sourceAccess, authority: { mode: 'read-only', source: 'workspace-authority', reason: 'Explicit bounded security input read.' },
    caller: 'security-analysis', reason: 'Read explicitly selected security report or patch', reportSafeTarget: 'selected security input' });
  const after = snapshotFile(exactFile(root, absolute), 4 * 1024 * 1024, false).snapshot;
  if (before.identity !== after.identity || before.digest !== after.digest || digest(text) !== before.digest) throw new Error('Security input changed during verified read.');
  return text;
}
