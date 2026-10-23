import { previewReadAccess } from '../preview/read.js';
import { assertRecoveryReadAccess, RecoveryReadControlError, RecoveryReadLimitError, recoveryReadBudget, type RecoveryReadAccess } from '../read.js';
import { RESTORE_WRITE_READ_LIMITS } from './limits.js';
import path from 'node:path';

interface RestoreReadInput {
  readonly workspaceRoot: string;
  readonly abortSignal?: AbortSignal;
  readonly readAccess?: RecoveryReadAccess;
  readonly assertFileAccess?: (absolutePath: string) => void;
}

/** Share fresh preparation and locked target budgets across the original primitive calls. */
export function restoreReadAccess(input: RestoreReadInput) {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const caller = input.readAccess ?? {};
  const signal = input.abortSignal ?? caller.signal;
  const preparation = previewReadAccess(workspaceRoot, { signal });
  const targets = recoveryReadBudget(RESTORE_WRITE_READ_LIMITS.totalBytes, signal, undefined,
    'Restore execution exceeds its target source size limit.');
  let refused = false;
  let refusal: unknown;
  const check = (bound?: RestoreReadInput): void => {
    if (refused) throw refusal;
    try {
      preparation.check();
      assertRecoveryReadAccess(caller);
      if (bound) {
        if (path.resolve(bound.workspaceRoot) !== workspaceRoot) throw new Error('Restore read workspace changed.');
        bound.abortSignal?.throwIfAborted();
        if (bound.readAccess !== caller) assertRecoveryReadAccess(bound.readAccess ?? {});
      }
    }
    catch (error) { refused = true; refusal = error; throw error; }
  };
  const admit = (bytes: number, current: boolean, bound?: RestoreReadInput): void => {
    check(bound);
    try {
      if (current) {
        if (bytes > RESTORE_WRITE_READ_LIMITS.fileBytes) throw new RecoveryReadLimitError('Restore execution file exceeds its source size limit.');
        targets.admit(bytes);
      } else preparation.admit(bytes);
      caller.admit?.(bytes);
      if (bound?.readAccess !== caller) bound?.readAccess?.admit?.(bytes);
      check(bound);
    } catch (error) {
      refused = true;
      refusal = error instanceof RecoveryReadControlError || error instanceof RecoveryReadLimitError ? error : new RecoveryReadControlError(error);
      throw refusal;
    }
  };
  const bind = (bound: RestoreReadInput) => ({
    readAccess: { signal, check: (): void => check(bound), admit: (bytes: number): void => admit(bytes, false, bound) },
    admitCurrent: (bytes: number): void => admit(bytes, true, bound),
    assertFileAccess: (absolute: string): void => {
      check(bound);
      try { bound.assertFileAccess?.(absolute); }
      catch (error) { refused = true; refusal = new RecoveryReadControlError(error); throw refusal; }
      check(bound);
    },
  });
  return { ...bind(input), bind };
}
