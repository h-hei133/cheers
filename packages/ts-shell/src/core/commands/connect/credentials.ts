import type { ProviderConnectionConfig, RuntimeConfigFile } from '../../../config/runtimeConfig.js';
import { sameValue } from '../../../config/values.js';
import { accountAuthKey } from '../../providers/facts.js';

/** Remove only exact credential mirrors owned solely by the removed connection. */
export function withoutConnectionCredentials(credentials: RuntimeConfigFile['providerCredentials'], removed: ProviderConnectionConfig,
  remaining: readonly ProviderConnectionConfig[]): RuntimeConfigFile['providerCredentials'] {
  const profile = credentials?.[removed.provider];
  if (!profile) return credentials;
  const peers = remaining.filter(connection => connection.provider === removed.provider);
  const next = { ...profile };
  const apiKey = profile.apiKey?.trim();
  if (apiKey && apiKey === removed.apiKey?.trim() && !peers.some(connection => connection.apiKey?.trim() === apiKey)) delete next.apiKey;
  const slot = accountAuthKey(removed.provider);
  if (slot && profile.accountAuth?.[slot] && sameValue(profile.accountAuth[slot], removed.accountAuth?.[slot])
    && !peers.some(connection => sameValue(connection.accountAuth?.[slot], profile.accountAuth![slot]))) {
    const accountAuth = { ...profile.accountAuth }; delete accountAuth[slot];
    next.accountAuth = Object.keys(accountAuth).length ? accountAuth : undefined;
  }
  return { ...credentials, [removed.provider]: next };
}
