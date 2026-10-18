import type { AccountAuthConfig, RuntimeConfig } from '../../../config/runtimeConfig.js';
import { sameValue } from '../../../config/values.js';
import { accountAuthKey } from '../../providers/facts.js';
import type { ProviderCredentialResolution } from '../../shell/providerCredentials.js';

/** Carry a verified rotation into the invocation's captured owner and exact mirror. */
export function projectAccountAuth(config: RuntimeConfig, resolution: ProviderCredentialResolution, accountAuth: AccountAuthConfig): RuntimeConfig {
  const { provider, credential } = resolution; const slot = accountAuthKey(provider);
  if (!slot || !credential?.accountAuth) return config;
  const profile = config.providerCredentials[provider];
  const mirror = sameValue(profile?.accountAuth?.[slot], credential.accountAuth);
  return { ...config,
    providerConnections: config.providerConnections.map(connection => credential.source === 'connection'
      && connection.id === credential.connectionId && connection.provider === provider
      && sameValue(connection.accountAuth?.[slot], credential.accountAuth)
      ? { ...connection, accountAuth: { ...connection.accountAuth, [slot]: accountAuth } } : connection),
    ...(mirror ? { providerCredentials: { ...config.providerCredentials,
      [provider]: { ...profile, accountAuth: { ...profile?.accountAuth, [slot]: accountAuth } } } } : {}),
  };
}
