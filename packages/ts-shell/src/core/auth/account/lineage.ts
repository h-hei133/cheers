import { createHash } from 'node:crypto';
import type { AccountAuthConfig, RuntimeProvider } from '../../../config/runtimeConfig.js';
import { googleOAuthConfig, openAIOAuthConfig, resolveGoogleClientId } from '../oauth/providers.js';

export interface RefreshIdentity {
  readonly provider: RuntimeProvider;
  readonly refreshToken: string;
  readonly clientId?: string;
}

export function credentialDigest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)).digest('hex');
}

/** The trusted issuer, client and token identify consumption independently of its slot. */
export function refreshLineage(input: RefreshIdentity & { readonly credentialId?: string }): string {
  const config = input.provider === 'openai' ? openAIOAuthConfig()
    : input.provider === 'google' ? googleOAuthConfig(resolveGoogleClientId(input.clientId)) : undefined;
  if (!config) throw new Error('This account has no refresh protocol.');
  return credentialDigest([input.provider, config.tokenUrl, config.clientId, credentialDigest(input.refreshToken.trim())]);
}

/** Read-only mapping of an opaque record written by the earlier slot-bound format. */
export function legacyRefreshLineage(input: RefreshIdentity & { readonly credentialId: string }): string {
  return createHash('sha256').update(`${input.provider}\u0000${input.credentialId}\u0000${createHash('sha256').update(input.refreshToken).digest('hex')}`).digest('hex');
}

export function accountGeneration(account: AccountAuthConfig): string { return credentialDigest(account); }
