export type ModelWriteState = 'unchanged' | 'unknown' | 'persisted';
type ModelWriteCode = 'invalid' | 'conflict' | 'read-failed' | 'lock-failed' | 'write-failed' | 'verification-failed';

/** Controlled diagnostics never include stored state or underlying I/O errors. */
export class SessionModelWriteError extends Error {
  constructor(readonly code: ModelWriteCode, readonly state: ModelWriteState, readonly cleanupFailed = false) {
    const outcome = state === 'unchanged' ? 'this attempt did not write'
      : state === 'persisted' ? 'saved and verified, but lock cleanup failed'
        : 'write started; session preference is unverified';
    super(`Session model ${code}: ${outcome}.${cleanupFailed ? ' Lock cleanup also failed.' : ''}`);
    this.name = 'SessionModelWriteError';
  }
}
