import { captureWorkspaceRoot, assertWorkspaceRoot } from '../../../core/workspace/roots.js';
import { assertCurrentProfile, currentProfile } from '../../../core/paths/profile/context.js';
import { RecoveryReadControlError, RecoveryReadLimitError, recoveryReadBudget } from '../read.js';
import { RESTORE_PREVIEW_LIMITS } from './limits.js';
import fs from 'node:fs';
import path from 'node:path';

export interface RestorePreviewAccess {
  readonly signal?: AbortSignal;
  readonly admission?: () => string | undefined;
}

/** Preserve the first refused source across original metadata/target reader cleanup. */
export function previewReadAccess(workspaceRoot: string, input: RestorePreviewAccess) {
  const budget = recoveryReadBudget(RESTORE_PREVIEW_LIMITS.totalBytes, input.signal, input.admission,
    'Restore preview exceeds its source size limit.');
  budget.check();
  const originalRoot = path.resolve(workspaceRoot);
  const workspace = captureWorkspaceRoot(originalRoot, originalRoot, 'read');
  const profile = currentProfile();
  let refused = false;
  let refusal: unknown;
  const check = (): void => {
    if (refused) throw refusal;
    try {
      budget.check(); assertWorkspaceRoot(workspace);
      if (fs.realpathSync(originalRoot) !== workspace.path) throw new Error('Restore read workspace changed.');
      if (profile) assertCurrentProfile(profile);
    }
    catch (error) {
      refused = true;
      refusal = error instanceof RecoveryReadControlError || error instanceof RecoveryReadLimitError ? error : new RecoveryReadControlError(error);
      throw refusal;
    }
  };
  const admit = (bytes: number): void => {
    check();
    try { budget.admit(bytes); }
    catch (error) { refused = true; refusal = error; throw error; }
  };
  const admitCurrent = (bytes: number): void => {
    check();
    if (bytes > RESTORE_PREVIEW_LIMITS.fileBytes) {
      refused = true; refusal = new RecoveryReadLimitError('Restore preview file exceeds its source size limit.'); throw refusal;
    }
    admit(bytes);
  };
  return { signal: input.signal, check, admit, admitCurrent };
}
