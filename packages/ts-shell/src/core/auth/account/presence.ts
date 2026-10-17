import type { ProviderConnectionConfig, ProviderCredentialConfig, RuntimeProvider } from '../../../config/runtimeConfig.js';
import { providerFacts } from '../../providers/facts.js';

/** The subset of availability a single connection can establish locally. */
export type ConnectionCredentialState = 'ready' | 'credential-missing' | 'pending' | 'error';

/** The fields credential presence reads; a stored file and an accepted runtime both have them. */
export interface CredentialPresenceConfig {
  readonly providerCredentials?: Partial<Record<RuntimeProvider, ProviderCredentialConfig>>;
}

export function credentialSources(config: CredentialPresenceConfig, provider: RuntimeProvider, env: NodeJS.ProcessEnv) {
  const profile = config.providerCredentials?.[provider];
  const envName = providerFacts(provider).apiKeyEnvVar;
  return {
    env: Boolean(env[envName]?.trim()),
    configApiKey: Boolean(profile?.apiKey?.trim()),
    configAccount: Boolean(profile?.accountAuth && Object.keys(profile.accountAuth).length),
  };
}

/** Pending and error are persistent connection facts and outrank credential presence. */
export function connectionCredentialState(config: CredentialPresenceConfig, connection: ProviderConnectionConfig, env: NodeJS.ProcessEnv): { state: ConnectionCredentialState; reason: string } {
  if (connection.status === 'pending') return { state: 'pending', reason: 'Login or setup is pending; finish it before requests.' };
  if (connection.status === 'error') return { state: 'error', reason: 'Connection setup ended in an error state; sign in again.' };
  if (connection.authType === 'account-auth' && connection.accountAuth && Object.keys(connection.accountAuth).length) {
    return { state: 'ready', reason: 'Account credential is stored on this connection.' };
  }
  if (connection.apiKey?.trim()) return { state: 'ready', reason: 'API key is stored on this connection.' };
  if (connection.accountAuth && Object.keys(connection.accountAuth).length) {
    return { state: 'ready', reason: 'Account credential is stored on this connection.' };
  }
  const legacy = credentialSources(config, connection.provider, env);
  if (legacy.env) return { state: 'ready', reason: `Credential comes from ${providerFacts(connection.provider).apiKeyEnvVar}.` };
  if (legacy.configApiKey || legacy.configAccount) return { state: 'ready', reason: 'Credential comes from the provider profile, not this connection.' };
  return { state: 'credential-missing', reason: 'No credential is stored for this connection.' };
}
