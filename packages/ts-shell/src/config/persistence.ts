import path from 'node:path';
import { createHash } from 'node:crypto';
import { freezeDeep } from '../core/values/freeze.js';
import { withFileLock, writeTextFileAtomic } from '../session/store/sessionFileStore.js';
import { readConfigSnapshot } from './document.js';
import { type ConfigFields } from './fields.js';
import { validateRawConfig } from './layers.js';
import { ConfigDocumentError } from './syntax.js';
import { patchConfigDocument } from './patch.js';
import { mergeConfigEdit } from './conflict.js';
import { ConfigWriteError, type ConfigWriteState } from './outcome.js';

export interface ConfigEdit<T> {
  readonly path: string;
  readonly revision: string | null;
  readonly values: T;
}

/** Explicit immutable baselines cannot accidentally survive a spread as raw config. */
class EditBaseline<T> implements ConfigEdit<T> {
  constructor(readonly path: string, readonly revision: string | null, readonly values: T) { freezeDeep(this); }
}

function revision(text: string | undefined): string | null {
  return text === undefined ? null : createHash('sha256').update(text).digest('hex');
}

export function readConfigEdit<T>(filePath: string, fields: ConfigFields): ConfigEdit<T> {
  const snapshot = readConfigSnapshot(filePath);
  const values = snapshot?.values ?? {};
  validateRawConfig(values, fields);
  return new EditBaseline(path.resolve(filePath), revision(snapshot?.text), values as T);
}

/** Lock + reread protects participating writers, not external editors' rename windows. */
export function persistConfigEdit<T>(filePath: string, patch: T, baseline: ConfigEdit<T>, fields: ConfigFields): string {
  if (!(baseline instanceof EditBaseline) || baseline.path !== path.resolve(filePath)) throw new ConfigWriteError('baseline-invalid', 'unchanged');
  let state: ConfigWriteState = 'unchanged';
  let code: 'lock-failed' | 'invalid-document' | 'write-failed' | 'verification-failed' = 'lock-failed';
  let cleanupFailed = false;
  let savedRevision: string | undefined;
  try {
    code = 'invalid-document';
    validateRawConfig(patch, fields);
    const desired = JSON.parse(JSON.stringify({ ...baseline.values, ...patch }));
    validateRawConfig(desired, fields);
    code = 'lock-failed';
    return withFileLock(`${baseline.path}.lock`, () => {
      code = 'invalid-document';
      const current = readConfigSnapshot(baseline.path);
      if (baseline.revision !== null && !current) throw new ConfigWriteError('conflict', 'unchanged');
      validateRawConfig(current?.values ?? {}, fields);
      const merged = mergeConfigEdit(baseline.values as Record<string, unknown>, desired, current?.values ?? {});
      validateRawConfig(merged, fields);
      const text = patchConfigDocument(current, merged);
      // Also guard absence and exact trivia. No CAS claim against an editor
      // that changes the path between this check and the atomic rename.
      if (readConfigSnapshot(baseline.path)?.text !== current?.text) throw new ConfigWriteError('conflict', 'unchanged');
      if (text !== current?.text) {
        state = 'unknown'; code = 'write-failed';
        writeTextFileAtomic(baseline.path, text);
        code = 'verification-failed';
        if (readConfigSnapshot(baseline.path)?.text !== text) throw new ConfigWriteError('verification-failed', 'unknown');
        state = 'persisted'; savedRevision = revision(text)!;
      }
      code = 'lock-failed';
      return filePath;
    }, { recovery: 'local-dead', onReleaseError: () => { cleanupFailed = true; } });
  } catch (error) {
    if (error instanceof ConfigWriteError) throw new ConfigWriteError(error.code, error.state, cleanupFailed, savedRevision);
    throw new ConfigWriteError(error instanceof ConfigDocumentError && state === 'unchanged' ? error.code : code, state, cleanupFailed, savedRevision);
  }
}
