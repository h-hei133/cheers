import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { resolveUserDataFile } from '../../paths/userHome.js';
import { profilePathOverride } from '../../paths/profile/context.js';
import { withFileLock, writeJsonFileAtomic } from '../../../session/store/sessionFileStore.js';
import { isRecord } from '../../values/record.js';
import type { RuntimeProvider } from '../../../config/runtimeConfig.js';
import { sameValue } from '../../../config/values.js';

/**
 * Cross-process refresh ownership.
 *
 * An in-process single flight stops two callers in one process from spending the
 * same refresh token. A second process has its own map, so the same token can
 * still be exchanged twice — the second exchange fails because the first already
 * rotated it, and the account looks randomly broken. This file is the shared
 * record of which process owns which exchange, and how far it got.
 */
export type RefreshPhase = 'prepared' | 'dispatched' | 'unknown';
const VERSION = 1;
const LEASE_TTL_MS = 2 * 60_000;
const UNKNOWN_TTL_MS = 7 * 24 * 60 * 60_000;

interface LeaseRecord {
  readonly owner: string;
  readonly phase: RefreshPhase;
  readonly generation: string;
  readonly expiresAt: number;
  readonly updatedAt: number;
}
interface LeaseFile { readonly version: number; readonly leases: Record<string, LeaseRecord> }

export interface RefreshLeaseInput {
  readonly provider: RuntimeProvider;
  readonly credentialId: string;
  readonly generation: string;
  readonly refreshToken: string;
  readonly owner?: string;
  readonly now?: number;
  readonly ttlMs?: number;
}

export interface RefreshLeaseResult {
  readonly acquired: boolean;
  readonly owner: string;
  /** The previous owner may have spent the token; replaying it is not authorized. */
  readonly unknown?: boolean;
  readonly holder?: string;
}

export class RefreshLeaseError extends Error {}

export function refreshLeasesPath(): string {
  return profilePathOverride('CHEERS_REFRESH_LEASES_FILE') || resolveUserDataFile('refresh-leases.json');
}

/** The refresh token is the thing an exchange spends, so it names the lineage. */
export function refreshLineage(input: Pick<RefreshLeaseInput, 'provider' | 'credentialId' | 'refreshToken'>): string {
  return createHash('sha256').update(`${input.provider}\u0000${input.credentialId}\u0000${createHash('sha256').update(input.refreshToken).digest('hex')}`).digest('hex');
}

function readFile(): LeaseFile {
  let raw: unknown;
  try { raw = JSON.parse(fs.readFileSync(refreshLeasesPath(), 'utf8')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: VERSION, leases: {} };
    throw new RefreshLeaseError('Refresh lease state could not be read.');
  }
  if (!isRecord(raw) || raw.version !== VERSION || !isRecord(raw.leases)) throw new RefreshLeaseError('Refresh lease state has an unsupported shape.');
  const leases: Record<string, LeaseRecord> = {};
  for (const [key, value] of Object.entries(raw.leases)) {
    if (!isRecord(value) || typeof value.owner !== 'string' || !['prepared', 'dispatched', 'unknown'].includes(String(value.phase))
      || typeof value.generation !== 'string' || !Number.isSafeInteger(value.expiresAt) || !Number.isSafeInteger(value.updatedAt)) {
      throw new RefreshLeaseError('Refresh lease state contains an invalid entry.');
    }
    leases[key] = { owner: value.owner, phase: value.phase as RefreshPhase, generation: value.generation, expiresAt: value.expiresAt as number, updatedAt: value.updatedAt as number };
  }
  return { version: VERSION, leases };
}

function writeFile(file: LeaseFile): void {
  writeJsonFileAtomic(refreshLeasesPath(), file);
  if (!sameValue(readFile().leases, file.leases)) throw new RefreshLeaseError('Refresh lease state write could not be verified.');
}

function mutate<T>(action: (leases: Record<string, LeaseRecord>, now: number) => T, now = Date.now()): T {
  return withFileLock(`${refreshLeasesPath()}.lock`, () => {
    const file = readFile();
    const leases = { ...file.leases };
    for (const [key, value] of Object.entries(leases)) {
      // Only unsent preparation expires. Age cannot prove that a dispatched or
      // unknown token is safe to spend again, including during unrelated cleanup.
      if (value.phase === 'prepared' && value.expiresAt < now - LEASE_TTL_MS) delete leases[key];
    }
    const result = action(leases, now);
    writeFile({ version: VERSION, leases });
    return result;
  });
}

/** Claim the lineage before anything is sent. An expired dispatched lease stays unknown. */
export function acquireRefreshLease(input: RefreshLeaseInput): RefreshLeaseResult {
  const owner = input.owner ?? randomUUID();
  const now = input.now ?? Date.now();
  const ttl = input.ttlMs ?? LEASE_TTL_MS;
  const key = refreshLineage(input);
  return mutate((leases) => {
    const existing = leases[key];
    if (existing && existing.expiresAt >= now) {
      return { acquired: false, owner, holder: existing.owner, ...(existing.phase === 'unknown' ? { unknown: true } : {}) };
    }
    if (existing?.phase === 'dispatched' || existing?.phase === 'unknown') {
      // The previous owner may have spent the token and lost the answer. Taking
      // over would replay a token the provider may have already rotated.
      leases[key] = { ...existing, phase: 'unknown', updatedAt: now, expiresAt: now + UNKNOWN_TTL_MS };
      return { acquired: false, owner, unknown: true, holder: existing.owner };
    }
    leases[key] = { owner, phase: 'prepared', generation: input.generation, updatedAt: now, expiresAt: now + ttl };
    return { acquired: true, owner };
  }, now);
}

export function markRefreshDispatched(key: string, owner: string, now = Date.now()): void {
  mutate((leases) => {
    const existing = leases[key];
    if (!existing || existing.owner !== owner || existing.phase !== 'prepared') throw new RefreshLeaseError('Refresh lease ownership changed before dispatch.');
    leases[key] = { ...existing, phase: 'dispatched', updatedAt: now, expiresAt: now + LEASE_TTL_MS };
  }, now);
}

/**
 * Clear the lineage after the token was stored.
 *
 * A follower that shared the exchange may persist it instead of the owner, so
 * completion is identified by the lineage generation rather than by the writer.
 * The key already includes the spent refresh token, so a new login cannot be
 * cleared by this call.
 */
export function finishRefreshLease(key: string, generation: string, now = Date.now()): void {
  mutate((leases) => {
    const existing = leases[key];
    if (!existing) return;
    if (existing.generation !== generation) throw new RefreshLeaseError('Refresh lease generation changed before completion.');
    delete leases[key];
  }, now);
}

/** The server may have rotated the token; keep the lineage blocked until re-login. */
export function markRefreshUnknown(key: string, owner: string, now = Date.now()): void {
  mutate((leases) => {
    const existing = leases[key];
    if (!existing || existing.owner !== owner) return;
    leases[key] = { ...existing, phase: 'unknown', updatedAt: now, expiresAt: now + UNKNOWN_TTL_MS };
  }, now);
}

export function releaseRefreshLease(key: string, owner: string, now = Date.now()): void {
  mutate((leases) => {
    const existing = leases[key];
    if (existing?.owner === owner && existing.phase === 'prepared') delete leases[key];
  }, now);
}

export function readRefreshLease(key: string): LeaseRecord | undefined {
  return readFile().leases[key];
}
