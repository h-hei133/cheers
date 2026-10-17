import { serverRequestedDelayMs } from '../../core/agent/retry.js';

/** One credential generation; a rotation starts a new, unblocked identity. */
export interface CredentialKey {
  readonly credentialId: string;
  readonly generation: string;
}

const backoffUntil = new Map<string, number>();
const LIMIT = 512;
/** No header means a minute: the provider said "slow down" without saying how long. */
export const DEFAULT_CREDENTIAL_BACKOFF_MS = 60_000;

function keyOf(key: CredentialKey): string {
  return `${key.credentialId}\u0000${key.generation}`;
}

/** A 429 is a fact about one credential, not about the provider or the session. */
export function noteCredentialRateLimit(key: CredentialKey, delayMs: number, now = Date.now()): void {
  if (!Number.isFinite(delayMs) || delayMs < 0) return;
  const until = now + Math.min(delayMs, 24 * 60 * 60_000);
  const existing = backoffUntil.get(keyOf(key));
  backoffUntil.set(keyOf(key), Math.max(until, existing ?? 0));
  while (backoffUntil.size > LIMIT) backoffUntil.delete(backoffUntil.keys().next().value!);
}

export function credentialBackoffRemaining(key: CredentialKey, now = Date.now()): number {
  const until = backoffUntil.get(keyOf(key));
  if (until === undefined) return 0;
  if (until <= now) { backoffUntil.delete(keyOf(key)); return 0; }
  return until - now;
}

/** A successful request proves the credential is usable again. */
export function clearCredentialBackoff(key: CredentialKey): void {
  backoffUntil.delete(keyOf(key));
}

/** Both header spellings are accepted; absent or unreadable falls back to the default. */
export function responseBackoffMs(headers: Pick<Headers, 'get'>, now = Date.now()): number {
  return serverRequestedDelayMs(headers.get('retry-after-ms'), headers.get('retry-after'), now) ?? DEFAULT_CREDENTIAL_BACKOFF_MS;
}

export function resetCredentialBackoffForTests(): void {
  backoffUntil.clear();
}
