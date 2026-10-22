/** One credential generation; a rotation starts a new, unblocked identity. */
import { profileScope } from '../../paths/profile/scope.js';

export interface CredentialKey {
  readonly credentialId: string;
  readonly generation: string;
}

const backoffUntil = new Map<string, number>();

function keyOf(key: CredentialKey): string {
  return profileScope(`${key.credentialId}\u0000${key.generation}`);
}

/** A provider deadline belongs to the credential that received it. */
export function noteCredentialRateLimit(key: CredentialKey, delayMs: number, now = Date.now()): void {
  if (!Number.isFinite(delayMs) || delayMs < 0 || !Number.isFinite(now)) return;
  // Expiry is the only proof that a provider deadline no longer constrains sends.
  for (const [identity, until] of backoffUntil) if (until <= now) backoffUntil.delete(identity);
  const until = Math.min(now + delayMs, Number.MAX_VALUE);
  const existing = backoffUntil.get(keyOf(key));
  backoffUntil.set(keyOf(key), Math.max(until, existing ?? 0));
}

export function credentialBackoffRemaining(key: CredentialKey, now = Date.now()): number {
  const until = backoffUntil.get(keyOf(key));
  if (until === undefined) return 0;
  if (until <= now) { backoffUntil.delete(keyOf(key)); return 0; }
  return until - now;
}

export function resetCredentialBackoffForTests(): void {
  backoffUntil.clear();
}
