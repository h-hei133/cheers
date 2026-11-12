import { isRetryableFailure } from '../../core/agent/retry.js';
import type { ProviderFailureClass } from '../registry/provider.js';

const causes = new Map<string, readonly [ProviderFailureClass, string]>([
  ['UND_ERR_CONNECT_TIMEOUT', ['provider_timeout', 'connection timed out']],
  ['UND_ERR_HEADERS_TIMEOUT', ['provider_timeout', 'timed out waiting for response headers']],
  ['UND_ERR_BODY_TIMEOUT', ['provider_timeout', 'timed out waiting for response body']],
  ['ETIMEDOUT', ['provider_timeout', 'request timed out']],
  ['UND_ERR_SOCKET', ['provider_network', 'connection closed']],
  ['ECONNRESET', ['provider_network', 'connection closed']],
  ['EPIPE', ['provider_network', 'connection closed']],
  ['ECONNREFUSED', ['provider_network', 'connection refused']],
  ['ENOTFOUND', ['provider_network', 'name lookup failed']],
  ['EAI_AGAIN', ['provider_network', 'name lookup failed']],
]);

/** Inspect error data without executing accessors or serializing private detail. */
function errorValue(error: unknown, key: string): unknown {
  if (!error || typeof error !== 'object') return undefined;
  try { return Object.getOwnPropertyDescriptor(error, key)?.value; }
  catch { return undefined; }
}

/** Native causes survive fetch's generic wrapper; only closed evidence leaves here. */
export function providerRequestError(error: unknown): {
  message: string; failureClass?: ProviderFailureClass; retryable: boolean;
} {
  const detail = typeof error === 'string' ? error : errorValue(error, 'message');
  // Redaction must not turn private quota/refusal wording into permission to retry.
  const retryable = isRetryableFailure('error', 'Network error: ' + (typeof detail === 'string' ? detail : ''));
  let cause: unknown = error;
  // A bounded walk also handles cyclic or unusually deep causes from custom fetches.
  for (let depth = 0; cause && depth < 8; depth++) {
    const code = errorValue(cause, 'code');
    const known = typeof code === 'string' ? causes.get(code) : undefined;
    if (known) return { message: 'Network error: ' + known[1] + '. Details withheld.', failureClass: known[0], retryable };
    cause = errorValue(cause, 'cause');
  }
  return { message: 'Network error: request failed. Details withheld.', retryable };
}
