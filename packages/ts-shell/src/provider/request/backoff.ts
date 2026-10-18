import { serverRequestedDelayMs } from '../../core/agent/retry.js';
export { credentialBackoffRemaining, noteCredentialRateLimit, resetCredentialBackoffForTests,
  type CredentialKey } from '../../core/auth/account/backoff.js';
/** No header means a minute: the provider said "slow down" without saying how long. */
export const DEFAULT_CREDENTIAL_BACKOFF_MS = 60_000;

/** Both header spellings are accepted; absent or unreadable falls back to the default. */
export function responseBackoffMs(headers: Pick<Headers, 'get'>, now = Date.now()): number {
  const delay = serverRequestedDelayMs(headers.get('retry-after-ms'), headers.get('retry-after'), now);
  return Math.min(delay ?? DEFAULT_CREDENTIAL_BACKOFF_MS, Number.MAX_VALUE);
}
