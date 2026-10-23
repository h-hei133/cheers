import path from 'node:path';
import { captureWorkspaceRoot } from '../../core/workspace/roots.js';
import { commitWorkspaceFile } from '../authority/commit.js';
import { inspectWorkspaceFile, matchesFileState, type FileExpectation } from '../authority/state.js';
import { withFileLock } from '../../runtime/execution/fileLock.js';
import { normalizeWorkspaceRelativePath, readRecoveryAuthorityRecord, type RecoveryAuthorityStoredRecord } from './recoveryAuthorityStore.js';
import { readRecoveryBlob } from './record.js';
import { assertRecoveryReadAccess, RecoveryReadControlError, RecoveryReadLimitError, type RecoveryReadAccess } from './read.js';

export type RestorePrimitiveBlockedReason =
  | 'invalid-workspace-relative-path' | 'record-not-found' | 'record-path-mismatch'
  | 'workspace-boundary' | 'current-state-mismatch' | 'current-content-hash-mismatch'
  | 'original-content-missing' | 'original-content-invalid' | 'current-version-unknown'
  | 'operation-receipt-required'
  | 'file-system-error' | 'write-unverified';

export interface RestorePrimitiveInput {
  readonly ledgerRoot: string;
  readonly authorityId: string;
  readonly recordId: string;
  readonly workspaceRoot: string;
  readonly workspaceRelativePath: string;
  readonly expectedCurrentState?: 'exists' | 'absent' | 'unknown';
  readonly expectedCurrentContentHash?: string;
  readonly assertFileAccess?: (absolutePath: string) => void;
  readonly abortSignal?: AbortSignal;
  readonly readAccess?: RecoveryReadAccess;
}

interface RestorePrimitiveFacts {
  readonly restoredFiles: readonly string[];
  readonly inspectedFiles: readonly string[];
  readonly rollbackAtomicityClaim: false;
  readonly evidence: readonly string[];
}
export type RestorePrimitiveResult = RestorePrimitiveFacts & (
  | { readonly restored: true; readonly outcome: 'restored-verified' }
  | { readonly restored: false; readonly outcome: 'blocked' | 'unknown'; readonly blockedReason: RestorePrimitiveBlockedReason }
);

export interface PreparedRestore {
  readonly mode?: number;
  readonly record: RecoveryAuthorityStoredRecord;
  readonly relativePath: string;
  readonly expected: FileExpectation;
  readonly content: string | undefined;
}

/** Blob preparation completes before taking the same lock as ordinary file edits. */
export async function prepareRecoveryRestore(input: RestorePrimitiveInput): Promise<PreparedRestore> {
  const readAccess = { ...input.readAccess, signal: input.abortSignal ?? input.readAccess?.signal };
  assertRecoveryReadAccess(readAccess);
  const relativePath = normalizeWorkspaceRelativePath(input.workspaceRelativePath);
  if (!relativePath) throw new RestoreBlocked('invalid-workspace-relative-path');
  const record = await readRecoveryAuthorityRecord({ ...input, readAccess });
  assertRecoveryReadAccess(readAccess);
  if (!record) throw new RestoreBlocked('record-not-found');
  if (record.workspaceRelativePath !== relativePath) throw new RestoreBlocked('record-path-mismatch');
  if (record.operation) {
    const workspace = captureWorkspaceRoot(input.workspaceRoot, input.workspaceRoot, 'write');
    if (record.operation.workspaceRoot !== workspace.path || record.operation.workspaceIdentity !== workspace.identity) throw new RestoreBlocked('workspace-boundary');
  }
  const state = input.expectedCurrentState ?? record.expectedCurrentState;
  const hash = input.expectedCurrentContentHash ?? record.expectedCurrentContentHash;
  if (state !== record.expectedCurrentState || hash !== record.expectedCurrentContentHash) throw new RestoreBlocked('record-path-mismatch');
  if (state === 'unknown' || (state === 'exists' && !hash)) throw new RestoreBlocked('current-version-unknown');
  let content: string | undefined;
  try { content = await readRecoveryBlob(input.ledgerRoot, record, readAccess); }
  catch (error) {
    readAccess.signal?.throwIfAborted();
    if (error instanceof RecoveryReadLimitError || error instanceof RecoveryReadControlError) throw error;
    throw new RestoreBlocked('original-content-invalid');
  }
  assertRecoveryReadAccess(readAccess);
  return { record, relativePath, expected: state === 'absent' ? { state } : { state, hash, mode: record.expectedCurrentMode }, content, mode: record.beforeMode };
}

export async function restoreRecoveryAuthorityRecord(input: RestorePrimitiveInput): Promise<RestorePrimitiveResult> {
  let prepared: PreparedRestore;
  try { prepared = await prepareRecoveryRestore(input); }
  catch (error) { return blocked(error instanceof RestoreBlocked ? error.reason : 'file-system-error', []); }
  if (prepared.record.operation) return blocked('operation-receipt-required', [prepared.relativePath]);
  return withFileLock(path.resolve(input.workspaceRoot, prepared.relativePath), async () => {
    const checkAccess = (absolute: string): void => { input.abortSignal?.throwIfAborted(); input.assertFileAccess?.(absolute); };
    let writerStarted = false;
    try {
      const current = inspectWorkspaceFile(input.workspaceRoot, prepared.relativePath, checkAccess);
      if (current.state !== prepared.expected.state) return blocked('current-state-mismatch', [prepared.relativePath]);
      if (!matchesFileState(current, prepared.expected)) return blocked('current-content-hash-mismatch', [prepared.relativePath]);
      writerStarted = true;
      commitWorkspaceFile({ workspaceRoot: input.workspaceRoot, relativePath: prepared.relativePath,
        expected: current, content: prepared.content, mode: prepared.mode, assertFileAccess: checkAccess });
      return { restored: true, outcome: 'restored-verified', restoredFiles: [prepared.relativePath], inspectedFiles: [prepared.relativePath], rollbackAtomicityClaim: false,
        evidence: ['recovery-restore-primitive:explicit-call', 'recovery-restore-primitive:current-content-guard-passed',
          'recovery-restore-primitive:single-file-restore', 'recovery-restore-primitive:verified', 'recovery-restore-primitive:no-atomic-rollback'] };
    } catch {
      return blocked(writerStarted ? 'write-unverified' : 'file-system-error', [prepared.relativePath], writerStarted ? 'unknown' : 'blocked');
    }
  });
}

class RestoreBlocked extends Error {
  constructor(readonly reason: RestorePrimitiveBlockedReason) { super(reason); }
}

function blocked(reason: RestorePrimitiveBlockedReason, inspected: readonly string[], outcome: 'blocked' | 'unknown' = 'blocked'): RestorePrimitiveResult {
  return { restored: false, blockedReason: reason, outcome, restoredFiles: [], inspectedFiles: inspected, rollbackAtomicityClaim: false,
    evidence: ['recovery-restore-primitive:blocked', `recovery-restore-primitive:blocker:${reason}`, `recovery-restore-primitive:outcome:${outcome}`, 'recovery-restore-primitive:no-atomic-rollback'] };
}
