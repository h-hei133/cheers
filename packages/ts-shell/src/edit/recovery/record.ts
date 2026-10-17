import fs from 'node:fs/promises';
import { constants, lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { ensureWorkspaceDirectory, workspaceFilePath } from '../authority/state.js';
import { hashContent } from '../authority/content.js';
import type { RecoveryAuthorityStoredRecord } from './model.js';
import { assertProfileStorage, currentProfile } from '../../core/paths/profile/context.js';

export const contentHashPattern = /^[a-f0-9]{64}$/;

export function safeRecoveryId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 200 && /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(value);
}

export function prepareLedgerDirectory(directory: string): void {
  const absolute = path.resolve(directory);
  assertProfileStorage(absolute);
  const root = path.parse(absolute).root;
  ensureWorkspaceDirectory(root, path.relative(root, absolute));
}

/** Read a confined ordinary file through the opened descriptor, with a bounded body. */
export async function readLedgerText(ledgerRoot: string, relative: string, maxBytes = 128 * 1024): Promise<string> {
  const profile = currentProfile();
  assertProfileStorage(ledgerRoot, profile);
  if (lstatSync(ledgerRoot).isSymbolicLink()) throw new Error('Recovery ledger is a symlink.');
  const absolute = workspaceFilePath(ledgerRoot, relative);
  assertProfileStorage(absolute, profile);
  const handle = await fs.open(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    assertProfileStorage(absolute, profile);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes) throw new Error('Recovery record is not a bounded ordinary file.');
    if (process.platform === 'linux' && realpathSync(`/proc/self/fd/${handle.fd}`) !== absolute) throw new Error('Recovery record changed path.');
    const bytes = await handle.readFile();
    if (bytes.length > maxBytes) throw new Error('Recovery record exceeds its size limit.');
    const text = bytes.toString('utf8');
    const final = await handle.stat();
    assertProfileStorage(absolute, profile);
    if (!Buffer.from(text, 'utf8').equals(bytes) || stat.size !== final.size || stat.mtimeMs !== final.mtimeMs || stat.ctimeMs !== final.ctimeMs) {
      throw new Error('Recovery record changed during inspection.');
    }
    return text;
  } finally { await handle.close(); }
}

export function validRecoveryRecord(value: unknown, authorityId: string, recordId: string): value is RecoveryAuthorityStoredRecord {
  if (!value || typeof value !== 'object') return false;
  const entry = value as RecoveryAuthorityStoredRecord;
  const binding = entry.operation;
  if (binding !== undefined && (!binding || binding.operationId !== authorityId || !safeRecoveryId(binding.operationId)
    || typeof binding.sessionId !== 'string' || !binding.sessionId || typeof binding.workspaceRoot !== 'string'
    || !path.isAbsolute(binding.workspaceRoot) || typeof binding.workspaceIdentity !== 'string'
    || !/^\d+:\d+:[\d.]+$/.test(binding.workspaceIdentity))) return false;
  return entry.schemaVersion === 1 && entry.authorityId === authorityId && entry.recordId === recordId
    && (entry.beforeMode === undefined || (Number.isInteger(entry.beforeMode) && entry.beforeMode >= 0 && entry.beforeMode <= 0o777))
    && (entry.expectedCurrentMode === undefined || (Number.isInteger(entry.expectedCurrentMode) && entry.expectedCurrentMode >= 0 && entry.expectedCurrentMode <= 0o777))
    && ['update', 'create', 'delete', 'move'].includes(entry.operationKind)
    && typeof entry.workspaceRelativePath === 'string' && entry.workspaceRelativePath.length <= 4096
    && ['exists', 'absent'].includes(entry.beforeState) && ['exists', 'absent', 'unknown'].includes(entry.expectedCurrentState)
    && (entry.beforeState === 'absent' ? entry.beforeContentRef === undefined && entry.beforeContentHash === undefined
      : typeof entry.beforeContentHash === 'string' && contentHashPattern.test(entry.beforeContentHash)
        && entry.beforeContentRef === `blobs/${entry.beforeContentHash}.content`
        && Number.isSafeInteger(entry.beforeContentSizeBytes) && entry.beforeContentSizeBytes! >= 0)
    && (entry.expectedCurrentContentHash === undefined || contentHashPattern.test(entry.expectedCurrentContentHash))
    && entry.capturedAtPhase === 'pre-write' && entry.persistence === 'non-default'
    && typeof entry.createdAt === 'string' && Array.isArray(entry.evidence) && entry.evidence.every(item => typeof item === 'string');
}

export async function readRecoveryBlob(ledgerRoot: string, record: RecoveryAuthorityStoredRecord): Promise<string | undefined> {
  if (record.beforeState === 'absent') return undefined;
  if (!safeRecoveryId(record.authorityId) || !record.beforeContentHash || record.beforeContentRef !== `blobs/${record.beforeContentHash}.content`) {
    throw new Error('Original content reference is invalid.');
  }
  const content = await readLedgerText(ledgerRoot, `${record.authorityId}/${record.beforeContentRef}`, 64 * 1024 * 1024);
  if (hashContent(content) !== record.beforeContentHash || Buffer.byteLength(content) !== record.beforeContentSizeBytes) {
    throw new Error('Original content integrity check failed.');
  }
  return content;
}
