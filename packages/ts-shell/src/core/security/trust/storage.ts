import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readConfigSnapshot, serializeConfigDocument } from '../../../config/document.js';
import { withFileLock, writeTextFileAtomic } from '../../../session/store/sessionFileStore.js';
import { TrustWriteError, type TrustStoreFile, type ProjectTrustRecord } from './model.js';
import { isTrustFileMissing } from './source.js';

export interface TrustPaths { readonly source: () => string; readonly target: string }
export interface TrustSnapshot { readonly source: string; readonly text: string | undefined; readonly value: TrustStoreFile }

/** The chosen source is part of identity, including promotion from a legacy path. */
export function trustRevision(source: string): string {
  let identity: string;
  try {
    const entry = fs.lstatSync(source, { bigint: true });
    const stat = fs.statSync(source, { bigint: true });
    identity = [entry, stat].map(value => `${value.dev}:${value.ino}:${value.size}:${value.mtimeNs}:${value.ctimeNs}`).join('/');
  } catch { identity = isTrustFileMissing(source) ? 'missing' : 'unavailable'; }
  return createHash('sha256').update(source).update('\0').update(identity).digest('hex');
}

export function readTrustSnapshot(source: string): TrustSnapshot {
  const snapshot = readConfigSnapshot(source);
  if (!snapshot) {
    if (!isTrustFileMissing(source)) throw new TrustWriteError('read-failed', 'unchanged');
    return { source, text: undefined, value: { version: 1, projects: {} } };
  }
  const value = snapshot.values;
  if (value.version !== 1 || !value.projects || typeof value.projects !== 'object' || Array.isArray(value.projects)) throw new TrustWriteError('invalid', 'unchanged');
  for (const [root, entry] of Object.entries(value.projects)) {
    const record = entry as Partial<ProjectTrustRecord> | null;
    if (!path.isAbsolute(root) || !record || typeof record !== 'object' || Array.isArray(record)
      || !['trusted', 'untrusted'].includes(record.trustLevel ?? '') || typeof record.decidedAt !== 'string') throw new TrustWriteError('invalid', 'unchanged');
  }
  return { source, text: snapshot.text, value: value as unknown as TrustStoreFile };
}

/** Merge under the existing process lock; never replace a damaged/unsupported store. */
export function saveTrustDecision(paths: TrustPaths, root: string, selectedPath: string, trustLevel: ProjectTrustRecord['trustLevel']): boolean {
  let state: TrustWriteError['state'] = 'unchanged';
  let code: TrustWriteError['code'] = 'lock-failed';
  let cleanupFailed = false;
  try {
    return withFileLock(paths.target + '.lock', () => {
      code = 'read-failed';
      const before = readTrustSnapshot(paths.source());
      // Only the selected alias is authorized for migration; other saved paths
      // must not disappear merely because a replacement link now points here.
      const matching = Object.keys(before.value.projects).filter(key => path.resolve(key) === root || path.resolve(key) === selectedPath);
      if (matching.length === 1 && matching[0] === root && before.value.projects[root]?.trustLevel === trustLevel) return false;
      const projects = { ...before.value.projects };
      for (const key of matching) delete projects[key];
      const value = { ...before.value, projects: { ...projects, [root]: { trustLevel, decidedAt: new Date().toISOString() } } };
      const text = serializeConfigDocument(value);
      const latest = readTrustSnapshot(paths.source());
      if (latest.source !== before.source || latest.text !== before.text) throw new TrustWriteError('conflict', 'unchanged');
      state = 'unknown'; code = 'write-failed';
      writeTextFileAtomic(paths.target, text, 0o600);
      code = 'verification-failed';
      if (paths.source() !== paths.target || readTrustSnapshot(paths.target).text !== text) throw new TrustWriteError('verification-failed', 'unknown');
      state = 'persisted'; code = 'lock-failed';
      return true;
    }, { recovery: 'local-dead', onReleaseError: () => { cleanupFailed = true; } });
  } catch (error) {
    throw new TrustWriteError(error instanceof TrustWriteError ? error.code : code, state, cleanupFailed);
  }
}
