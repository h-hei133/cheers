import type { ConfigDocumentError } from './syntax.js';

export type ConfigWriteState = 'unchanged' | 'unknown' | 'persisted';
type WriteCode = 'baseline-invalid' | 'conflict' | 'write-failed' | 'verification-failed' | 'lock-failed' | ConfigDocumentError['code'];

/** No values, keys, paths or underlying filesystem/provider errors escape. */
export class ConfigWriteError extends Error {
  constructor(readonly code: WriteCode, readonly state: ConfigWriteState, readonly cleanupFailed = false, readonly revision?: string) {
    const outcome = state === 'unchanged' ? 'this attempt did not write'
      : state === 'persisted' ? 'saved and verified, but lock cleanup failed'
        : 'write started; saved contents are unverified';
    super(`Config save ${code}: ${outcome}.${cleanupFailed ? ' Lock cleanup also failed.' : ''}`);
    this.name = 'ConfigWriteError';
  }
}
