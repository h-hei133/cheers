import { randomUUID } from 'node:crypto';
import { resolveUserDataFile } from '../../paths/userHome.js';
import { profilePathOverride } from '../../paths/profile/context.js';
import { legacyRefreshLineage, refreshLineage, type RefreshIdentity } from './lineage.js';
import { captureLeaseStore, mapLegacy, mutateLeases, readLeases } from './lease/state.js';
import { claimAttempt, finalize, producedAttempt, recover } from './lease/transition.js';
import { RefreshLeaseError, type RefreshBinding, type RefreshClaim, type RefreshProduction, type RefreshAttempt, type LoginClaim, type RefreshStore } from './lease/model.js';

export { RefreshLeaseError, refreshLineage, captureLeaseStore };
export type { RefreshPhase, RefreshBinding, RefreshClaim, RefreshProduction, RefreshStore } from './lease/model.js';
const LEASE_TTL_MS = 2 * 60_000;

export interface RefreshLeaseInput extends RefreshIdentity {
  readonly credentialId: string;
  readonly binding: RefreshBinding;
  readonly file?: string;
  readonly store?: RefreshStore;
  readonly owner?: string;
  readonly now?: number;
  readonly ttlMs?: number;
  readonly prepare?: boolean;
}

export interface RefreshLeaseResult {
  readonly acquired: boolean;
  readonly owner: string;
  readonly unknown?: boolean;
  readonly holder?: string;
  readonly claim?: RefreshClaim;
  readonly recovered?: boolean;
}

export function refreshLeasesPath(): string {
  return profilePathOverride('CHEERS_REFRESH_LEASES_FILE') || resolveUserDataFile('refresh-leases.json');
}

/** A baseline is compatibility enrollment, not evidence of earlier unrecorded exchanges. */
export function acquireRefreshLease(input: RefreshLeaseInput): RefreshLeaseResult {
  const store = input.store ?? captureLeaseStore(input.file ?? refreshLeasesPath());
  const owner = input.owner ?? randomUUID(), now = input.now ?? Date.now();
  const key = refreshLineage(input), oldKey = legacyRefreshLineage(input);
  return mutateLeases(store, state => {
    mapLegacy(state, key, oldKey, now);
    if (Object.values(state.legacy).some(record => record.phase !== 'prepared')) return { acquired: false, owner, unknown: true };
    const recovered = recover(state, key, input.binding, store, now);
    if (recovered) return { acquired: false, owner, recovered: true };
    const row = state.leases[key] ??= { attempts: {} };
    const existing = row.active ? row.attempts[row.active] : undefined;
    // A durable native response already names this successor. A copied slot cannot enroll it.
    if (!row.grant && Object.values(state.leases).some(candidate => Object.values(candidate.attempts).some(attempt =>
      attempt.production?.lineage === key))) {
      return { acquired: false, owner, unknown: true };
    }
    if (!row.grant && !row.enrollment && Object.values(row.attempts).every(attempt => attempt.phase === 'prepared' && attempt.expiresAt < now)) {
      delete row.active;
      row.grant = { ...input.binding, id: randomUUID(), origin: 'baseline' };
    }
    if (!row.grant || row.grant.owner !== input.binding.owner || row.grant.generation !== input.binding.generation) {
      return { acquired: false, owner, unknown: true, ...(existing ? { holder: existing.owner } : {}) };
    }
    if (Object.values(row.attempts).some(attempt => attempt.grantId === row.grant!.id && attempt.phase === 'rotated-persisted')) {
      return { acquired: false, owner, unknown: true };
    }
    if (existing) {
      const claim = { ...store, key, owner: existing.owner, grantId: existing.grantId, attemptId: existing.id, binding: input.binding };
      if (existing.phase === 'unknown' || (existing.phase === 'dispatched' && existing.expiresAt < now)) {
        if (existing.phase !== 'unknown') row.attempts[existing.id] = { ...existing, phase: 'unknown', updatedAt: now };
        return { acquired: false, owner, holder: existing.owner, unknown: true, claim };
      }
      if (existing.expiresAt >= now) return { acquired: false, owner, holder: existing.owner, claim };
      // Only an unsent preparation may be replaced. Its immutable attempt stays fenced.
      delete row.active;
    }
    if (input.prepare === false) return { acquired: false, owner, ...(recovered ? { recovered: true } : {}) };
    const id = randomUUID();
    row.attempts[id] = { id, owner, grantId: row.grant.id, generation: input.binding.generation, phase: 'prepared',
      updatedAt: now, expiresAt: now + (input.ttlMs ?? LEASE_TTL_MS) };
    row.active = id; row.latest = id;
    return { acquired: true, owner, claim: { ...store, key, owner, grantId: row.grant.id, attemptId: id, binding: input.binding },
      ...(recovered ? { recovered: true } : {}) };
  });
}

export function markRefreshDispatched(claim: RefreshClaim, now = Date.now()): void {
  mutateLeases(claim, state => {
    const existing = claimAttempt(state, claim), row = state.leases[claim.key]!;
    if (row.active !== claim.attemptId || row.grant?.id !== claim.grantId || existing.phase !== 'prepared') {
      throw new RefreshLeaseError('Refresh attempt ownership changed before dispatch.');
    }
    row.attempts[existing.id] = { ...existing, phase: 'dispatched', updatedAt: now, expiresAt: now + LEASE_TTL_MS };
  });
}

export function recordRefreshProduction(claim: RefreshClaim, production: RefreshProduction, now = Date.now()): void {
  mutateLeases(claim, state => producedAttempt(state, claim, production, now));
}

export function finishRefreshLease(claim: RefreshClaim, saved: RefreshBinding, now = Date.now()): void {
  mutateLeases(claim, state => finalize(state, claim, saved, now));
}

/** A late leader cannot regress terminal consumption or erase its successor. */
export function markRefreshUnknown(claim: RefreshClaim, now = Date.now()): void {
  mutateLeases(claim, state => {
    const existing = claimAttempt(state, claim), row = state.leases[claim.key]!;
    if (row.active !== claim.attemptId || existing.phase === 'rotated-persisted') return;
    if (existing.phase === 'dispatched' || existing.phase === 'unknown') {
      row.attempts[existing.id] = { ...existing, phase: 'unknown', updatedAt: now };
    }
  });
}

export function releaseRefreshLease(claim: RefreshClaim): void {
  mutateLeases(claim, state => {
    const existing = claimAttempt(state, claim), row = state.leases[claim.key]!;
    if (row.active === claim.attemptId && existing.phase === 'prepared') delete row.active;
  });
}

export function readRefreshAttempt(claim: RefreshClaim): RefreshAttempt | undefined {
  const row = readLeases(claim).leases[claim.key], attempt = row?.attempts[claim.attemptId];
  return attempt?.grantId === claim.grantId && attempt.owner === claim.owner ? attempt : undefined;
}

export function readRefreshLease(key: string, source: string | RefreshStore = refreshLeasesPath()): RefreshAttempt | undefined {
  const row = readLeases(typeof source === 'string' ? captureLeaseStore(source) : source).leases[key];
  return row && (row.active || row.latest) ? row.attempts[(row.active || row.latest)!] : undefined;
}

/** New login storage cannot later borrow compatibility enrollment after native verification failed. */
export function reserveRefreshLogin(input: RefreshIdentity & { readonly file?: string; readonly store?: RefreshStore; readonly owner: string;
  readonly generation: string; readonly native: boolean }): LoginClaim | undefined {
  const key = refreshLineage(input);
  const store = input.store ?? captureLeaseStore(input.file ?? refreshLeasesPath());
  return mutateLeases(store, state => {
    if (Object.values(state.legacy).some(record => record.phase !== 'prepared')) return undefined;
    const row = state.leases[key];
    if (row && (row.grant || row.enrollment || Object.keys(row.attempts).length)) return undefined;
    const enrollment = { id: randomUUID(), owner: input.owner, generation: input.generation, native: input.native };
    state.leases[key] = { enrollment, attempts: {} };
    return { ...store, ...enrollment, key };
  });
}

/** A native login grants only its unique reserved lineage after exact owner storage verification. */
export function grantRefreshLogin(claim: LoginClaim, binding: RefreshBinding): boolean {
  return mutateLeases(claim, state => {
    const row = state.leases[claim.key], enrollment = row?.enrollment;
    if (!enrollment || !enrollment.native || enrollment.id !== claim.id || enrollment.owner !== claim.owner
      || enrollment.generation !== claim.generation || binding.generation !== claim.generation
      || row.grant || Object.keys(row.attempts).length || Object.values(state.legacy).some(record => record.phase !== 'prepared')) return false;
    row.grant = { ...binding, id: randomUUID(), origin: 'login', predecessor: enrollment.id };
    return true;
  });
}
