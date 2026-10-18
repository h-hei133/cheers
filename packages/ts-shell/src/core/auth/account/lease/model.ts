import type { ProfileIdentity } from '../../../paths/profile/context.js';

export type RefreshPhase = 'prepared' | 'dispatched' | 'rotated-persisted' | 'unknown';

/** In-memory storage authority captured before asynchronous provider work. */
export interface RefreshStore {
  readonly file: string;
  readonly lock: string;
  readonly profile?: ProfileIdentity;
}

/** Hashes bind an authorization to its exact storage owner and credential material. */
export interface RefreshBinding {
  readonly owner: string;
  readonly generation: string;
  readonly storage: string;
}

export interface RefreshGrant extends RefreshBinding {
  readonly id: string;
  readonly origin: 'baseline' | 'login' | 'rotation';
  readonly predecessor?: string;
}

/** Native response fingerprint, durably recorded before the configuration writer. */
export interface RefreshProduction extends RefreshBinding {
  readonly lineage: string;
}

export interface RefreshAttempt {
  readonly id: string;
  readonly owner: string;
  readonly grantId: string;
  readonly generation: string;
  readonly phase: RefreshPhase;
  readonly expiresAt: number;
  readonly updatedAt: number;
  readonly production?: RefreshProduction;
}

export interface LeaseRecord {
  grant?: RefreshGrant;
  active?: string;
  latest?: string;
  enrollment?: LoginEnrollment;
  readonly attempts: Record<string, RefreshAttempt>;
}

export interface LoginEnrollment {
  readonly id: string;
  readonly owner: string;
  readonly generation: string;
  readonly native: boolean;
}

export interface LoginClaim extends LoginEnrollment, RefreshStore {
  readonly key: string;
}

export interface LegacyLease {
  readonly owner: string;
  readonly phase: 'prepared' | 'dispatched' | 'unknown';
  readonly generation: string;
  readonly expiresAt: number;
  readonly updatedAt: number;
}

export interface LeaseFile {
  readonly version: 2;
  readonly leases: Record<string, LeaseRecord>;
  /** Unidentified earlier records retain store-wide uncertainty. */
  readonly legacy: Record<string, LegacyLease>;
}

export interface RefreshClaim extends RefreshStore {
  readonly key: string;
  readonly grantId: string;
  readonly attemptId: string;
  readonly owner: string;
  readonly binding: RefreshBinding;
}

export class RefreshLeaseError extends Error {}
