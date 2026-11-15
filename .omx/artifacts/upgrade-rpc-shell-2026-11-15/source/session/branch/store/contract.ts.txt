import type { SessionReadLimits } from '../../store/sessionStore.js';

export const MAX_STORE_VALUE_CHARS = 256 * 1024;
export const MAX_STORE_TOTAL_CHARS = 1024 * 1024;
export const CODEMODE_STORE_NAMESPACE = 'codemode';
export const MAX_STORE_REVISION_KEYS = 16_384;
export const MAX_STORE_REVISION_KEY_CHARS = 1024 * 1024;

export type BranchStoreStatus = 'unchanged' | 'unknown' | 'persisted';
export type BranchStoreReason = 'unavailable' | 'conflict' | 'write-failed' | 'verification-failed' | 'lock-failed' | 'invalid' | 'budget';
export type BranchStoreWrites = Readonly<Record<string, string | null>>;

export class BranchStoreError extends Error {
  constructor(readonly reason: BranchStoreReason, readonly status: BranchStoreStatus = 'unchanged') {
    super(`Branch storage ${reason}; persistence ${status}.`); this.name = 'BranchStoreError';
  }
}

/** Internal namespaces use a different wire discriminator from legacy worker storage. */
export function isBranchStoreNamespace(value: unknown): value is string {
  return typeof value === 'string' && value !== CODEMODE_STORE_NAMESPACE && /^[a-z][a-z0-9._-]{0,63}$/.test(value);
}

export interface BranchStoreTranscriptEntry {
  readonly type: 'branch-store';
  readonly id: string;
  readonly namespace: string;
  readonly sourceEntryId: string;
  readonly entries: BranchStoreWrites;
  readonly timestamp: string;
}

export interface BranchStoreInput {
  readonly sessionId: string;
  readonly cwd?: string;
  /** Selected by the host; never supplied by a worker write. */
  readonly namespace: string;
  readonly admission?: () => void;
  /** Captured per owner; overflow refuses acquisition or revalidation. */
  readonly limits?: SessionReadLimits;
}

/** Capture before asynchronous work. No operation reacquires a newer history lease. */
export interface BranchStoreHandle {
  readonly initial: Readonly<Record<string, string>>;
  /** Omitted keys validate the namespace; an empty list validates history/admission only. */
  readonly assertCurrent: (keys?: readonly string[], admission?: () => void) => void;
  /** Nonempty updates compare written-key revisions and retain unrelated writes. */
  readonly commit: (writes: BranchStoreWrites, admission?: () => void) => BranchStoreStatus;
}
