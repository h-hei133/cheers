import fs from 'node:fs';
import path from 'node:path';
import { withFileLock, writeJsonFileAtomic } from '../../../../session/store/sessionFileStore.js';
import { sameValue } from '../../../../config/values.js';
import { isRecord } from '../../../values/record.js';
import { assertProfileStorage, currentProfile } from '../../../paths/profile/context.js';
import { RefreshLeaseError, type LeaseFile, type LeaseRecord, type LegacyLease, type RefreshAttempt, type RefreshBinding, type RefreshStore } from './model.js';

export function captureLeaseStore(file: string): RefreshStore {
  const current = currentProfile();
  const profile = current && Object.freeze({ id: current.id, root: current.root, rootIdentity: current.rootIdentity,
    directories: Object.freeze(current.directories.map(directory => Object.freeze({ ...directory }))) });
  const absolute = path.resolve(file);
  const store = Object.freeze({ file: absolute, lock: `${absolute}.lock`, ...(profile ? { profile } : {}) });
  assertLeaseStore(store);
  return store;
}

function assertLeaseStore(store: RefreshStore): void {
  // Explicitly uncaptured legacy stores must not borrow a later async profile.
  if (!store.profile) return;
  assertProfileStorage(store.file, store.profile);
  assertProfileStorage(store.lock, store.profile);
}

function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
function binding(value: unknown): value is RefreshBinding {
  return isRecord(value) && text(value.owner) && text(value.generation) && text(value.storage);
}
function legacyRecords(raw: unknown): Record<string, LegacyLease> {
  if (!isRecord(raw)) throw new RefreshLeaseError('Refresh lease state has an unsupported shape.');
  for (const value of Object.values(raw)) {
    if (!isRecord(value) || !text(value.owner) || !text(value.generation)
      || !['prepared', 'dispatched', 'unknown'].includes(String(value.phase))
      || !Number.isSafeInteger(value.expiresAt) || !Number.isSafeInteger(value.updatedAt)) {
      throw new RefreshLeaseError('Refresh lease state contains an invalid entry.');
    }
  }
  return raw as unknown as Record<string, LegacyLease>;
}
function attempt(value: unknown, id: string): value is RefreshAttempt {
  return isRecord(value) && value.id === id && text(value.owner) && text(value.grantId) && text(value.generation)
    && ['prepared', 'dispatched', 'unknown', 'rotated-persisted'].includes(String(value.phase))
    && Number.isSafeInteger(value.expiresAt) && Number.isSafeInteger(value.updatedAt)
    && (value.production === undefined || (binding(value.production) && text((value.production as unknown as Record<string, unknown>).lineage)))
    && (value.phase !== 'rotated-persisted' || value.production !== undefined);
}
function records(raw: unknown): Record<string, LeaseRecord> {
  if (!isRecord(raw)) throw new RefreshLeaseError('Refresh lease state has an unsupported shape.');
  for (const value of Object.values(raw)) {
    if (!isRecord(value) || !isRecord(value.attempts)
      || (value.grant !== undefined && (!binding(value.grant) || !text((value.grant as unknown as Record<string, unknown>).id)
        || !['baseline', 'login', 'rotation'].includes(String((value.grant as unknown as Record<string, unknown>).origin))))
      || (value.active !== undefined && (!text(value.active) || !(value.active in value.attempts)))
      || (value.latest !== undefined && (!text(value.latest) || !(value.latest in value.attempts)))
      || (value.enrollment !== undefined && (!isRecord(value.enrollment) || !text(value.enrollment.id)
        || !text(value.enrollment.owner) || !text(value.enrollment.generation) || typeof value.enrollment.native !== 'boolean'))
      || Object.entries(value.attempts).some(([id, entry]) => !attempt(entry, id))) {
      throw new RefreshLeaseError('Refresh lease state contains an invalid entry.');
    }
  }
  return raw as unknown as Record<string, LeaseRecord>;
}

export function readLeases(store: RefreshStore): LeaseFile {
  assertLeaseStore(store);
  let raw: unknown;
  try { raw = JSON.parse(fs.readFileSync(store.file, 'utf8')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 2, leases: {}, legacy: {} };
    throw new RefreshLeaseError('Refresh lease state could not be read.');
  }
  if (!isRecord(raw) || (raw.version !== 1 && raw.version !== 2)) throw new RefreshLeaseError('Refresh lease state has an unsupported shape.');
  return raw.version === 1 ? { version: 2, leases: {}, legacy: legacyRecords(raw.leases) }
    : { version: 2, leases: records(raw.leases), legacy: legacyRecords(raw.legacy) };
}

export function mutateLeases<T>(store: RefreshStore, action: (state: LeaseFile) => T): T {
  assertLeaseStore(store);
  return withFileLock(store.lock, () => {
    assertLeaseStore(store);
    const state = readLeases(store);
    const result = action(state);
    assertLeaseStore(store);
    writeJsonFileAtomic(store.file, state);
    if (!sameValue(readLeases(store), state)) throw new RefreshLeaseError('Refresh lease state write could not be verified.');
    return result;
  });
}

/** Only the original opaque slot/token key identifies earlier consumption evidence. */
export function mapLegacy(state: LeaseFile, key: string, oldKey: string, now: number): void {
  for (const [id, record] of Object.entries(state.legacy)) {
    if (record.phase === 'prepared' && record.expiresAt < now) { delete state.legacy[id]; continue; }
    if (id !== oldKey) continue;
    const row = state.leases[key] ??= { attempts: {} };
    const attemptId = `legacy:${id}`;
    row.attempts[attemptId] = { ...record, id: attemptId, grantId: attemptId };
    row.latest ??= attemptId;
    row.active ??= attemptId;
    delete state.legacy[id];
  }
}
