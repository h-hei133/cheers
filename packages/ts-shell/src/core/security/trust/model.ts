export const TRUST_LEVELS = ['trusted', 'untrusted', 'session-only'] as const;
export type ProjectTrustLevel = typeof TRUST_LEVELS[number];
export type TrustDecision = 'trusted' | 'untrusted' | 'undecided' | 'unavailable';
export interface ProjectTrustRecord { readonly trustLevel: 'trusted' | 'untrusted'; readonly decidedAt: string }
export interface TrustStoreFile { readonly version: 1; readonly projects: Record<string, ProjectTrustRecord> }
export interface TrustWriteResult { readonly scope: 'durable' | 'process'; readonly changed: boolean }

export class TrustWriteError extends Error {
  constructor(readonly code: 'invalid' | 'read-failed' | 'conflict' | 'lock-failed' | 'write-failed' | 'verification-failed',
    readonly state: 'unchanged' | 'unknown' | 'persisted', readonly cleanupFailed = false) {
    super(`Trust save ${code}: ${state === 'unchanged' ? 'this attempt did not write' : state === 'persisted' ? 'saved and verified, but lock cleanup failed' : 'write started; saved decision is unverified'}.${cleanupFailed ? ' Lock cleanup also failed.' : ''}`);
    this.name = 'TrustWriteError';
  }
}
