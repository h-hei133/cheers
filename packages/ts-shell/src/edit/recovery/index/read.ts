import fs from 'node:fs/promises';
import { assertRecoveryReadAccess, RecoveryReadControlError, RecoveryReadLimitError, recoveryReadBudget, type RecoveryReadAccess } from '../read.js';
import { RECOVERY_INDEX_LIMITS } from './limits.js';

/** Local defaults compose with caller controls without weakening either source budget. */
export function indexReadAccess(input: { readonly signal?: AbortSignal; readonly readAccess?: RecoveryReadAccess }) {
  const caller = input.readAccess ?? {};
  const budget = recoveryReadBudget(RECOVERY_INDEX_LIMITS.metadataBytes, input.signal ?? caller.signal, undefined,
    'Snapshot index exceeds its source size limit.');
  let refused = false;
  let refusal: unknown;
  const check = (): void => {
    if (refused) throw refusal;
    try { budget.check(); assertRecoveryReadAccess(caller); }
    catch (error) { refused = true; refusal = error; throw error; }
  };
  const admit = (bytes: number): void => {
    check();
    try { budget.admit(bytes); caller.admit?.(bytes); }
    catch (error) {
      refused = true;
      refusal = error instanceof RecoveryReadLimitError || error instanceof RecoveryReadControlError ? error : new RecoveryReadControlError(error);
      throw refusal;
    }
  };
  return { signal: budget.signal, check, admit };
}

/** Enumerate bounded directory buffers and retain the complete admitted name inventory. */
export async function readIndexNames(directory: string, kind: 'namespaces' | 'records', access: RecoveryReadAccess): Promise<string[]> {
  assertRecoveryReadAccess(access);
  const handle = await fs.opendir(directory, { bufferSize: 32 });
  const names: string[] = [];
  let entries = 0;
  let primaryFailure: unknown;
  let failed = false;
  try {
    while (true) {
      assertRecoveryReadAccess(access);
      const entry = await handle.read();
      assertRecoveryReadAccess(access);
      if (!entry) break;
      if (++entries > RECOVERY_INDEX_LIMITS.directoryEntries) throw new RecoveryReadLimitError('Snapshot index exceeds its inventory limit.');
      const name = kind === 'namespaces'
        ? entry.isDirectory() && /^[A-Za-z0-9._-]+$/.test(entry.name) ? entry.name : undefined
        : entry.isFile() && entry.name.endsWith('.json') ? entry.name.slice(0, -5) : undefined;
      if (name === undefined) continue;
      if (names.length >= RECOVERY_INDEX_LIMITS.records) throw new RecoveryReadLimitError('Snapshot index exceeds its inventory limit.');
      names.push(name);
    }
  } catch (error) {
    primaryFailure = error; failed = true; throw error;
  } finally {
    try { await handle.close(); }
    catch (error) {
      assertRecoveryReadAccess(access);
      if (!failed || !(primaryFailure instanceof RecoveryReadControlError || primaryFailure instanceof RecoveryReadLimitError)) throw error;
    }
  }
  assertRecoveryReadAccess(access);
  return names.sort();
}
