import type { ProviderConnectionAuthType, ProviderConnectionConfig, ProviderCredentialConfig, RuntimeConfig, RuntimeProvider } from '../../config/runtimeConfig.js';
import type { CatalogProvider } from './catalog.js';
import { providerFacts } from '../providers/facts.js';

/**
 * What the configuration says about a provider, without asking the provider.
 *
 * Three different facts were previously collapsed into one "connected" label:
 * a named connection exists, a credential can be resolved for it, and the
 * endpoint has answered recently. Only the first two are knowable locally, so
 * they are reported separately and a live check is never implied.
 */
export type AvailabilityState = 'ready' | 'credential-missing' | 'pending' | 'error' | 'unsupported' | 'unknown';

/** The fields this projection reads; a stored file and an accepted runtime both have them. */
export interface AvailabilityConfig {
  readonly provider?: RuntimeProvider;
  readonly activeProviderConnectionId?: string;
  readonly providerConnections?: readonly ProviderConnectionConfig[];
  readonly providerCredentials?: Partial<Record<RuntimeProvider, ProviderCredentialConfig>>;
}

export interface ConnectionAvailability {
  readonly connectionId: string;
  readonly provider: RuntimeProvider;
  readonly label?: string;
  readonly authType: ProviderConnectionAuthType;
  /** Host and path only: userinfo, query and fragment never reach a surface. */
  readonly endpoint?: string;
  readonly model?: string;
  readonly state: AvailabilityState;
  readonly reason: string;
}

export interface ProviderAvailability {
  readonly provider: RuntimeProvider;
  readonly label: string;
  readonly catalogued: boolean;
  readonly state: AvailabilityState;
  readonly credential: 'present' | 'missing';
  readonly endpoint?: string;
  readonly connections: readonly ConnectionAvailability[];
  readonly models: readonly { readonly id: string; readonly contextWindow?: number }[];
  /** No probe is made here; a configured credential is not a measured round trip. */
  readonly measured: 'unknown';
}

export interface AvailabilitySnapshot {
  readonly activeConnectionId?: string;
  readonly activeProvider: RuntimeProvider;
  readonly activeModel?: string;
  readonly providers: readonly ProviderAvailability[];
}

/** A display form of an endpoint that cannot carry a secret. */
export function endpointLabel(baseUrl?: string): string | undefined {
  if (!baseUrl?.trim()) return undefined;
  try {
    const url = new URL(baseUrl.trim());
    if (!url.host) return undefined;
    return `${url.host}${url.pathname.replace(/\/+$/, '')}`;
  } catch { return undefined; }
}

export function availabilityLabel(state: AvailabilityState): string {
  switch (state) {
    case 'ready': return 'credential present';
    case 'credential-missing': return 'credential missing';
    case 'pending': return 'setup pending';
    case 'error': return 'setup error';
    case 'unsupported': return 'not in catalogue';
    default: return 'unverified';
  }
}

function credentialSources(config: AvailabilityConfig, provider: RuntimeProvider, env: NodeJS.ProcessEnv) {
  const profile = config.providerCredentials?.[provider];
  const envName = providerFacts(provider).apiKeyEnvVar;
  return {
    env: Boolean(env[envName]?.trim()),
    configApiKey: Boolean(profile?.apiKey?.trim()),
    configAccount: Boolean(profile?.accountAuth && Object.keys(profile.accountAuth).length),
  };
}

function connectionState(config: AvailabilityConfig, connection: ProviderConnectionConfig, env: NodeJS.ProcessEnv): { state: AvailabilityState; reason: string } {
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

function providerState(connections: readonly ConnectionAvailability[], credential: 'present' | 'missing', catalogued: boolean): AvailabilityState {
  if (connections.some(connection => connection.state === 'ready')) return 'ready';
  if (connections.some(connection => connection.state === 'pending')) return 'pending';
  if (connections.some(connection => connection.state === 'error')) return 'error';
  if (credential === 'present') return 'ready';
  return catalogued ? 'credential-missing' : 'unsupported';
}

export function availabilitySnapshot(input: {
  readonly config: AvailabilityConfig;
  readonly catalog: readonly CatalogProvider[];
  readonly env?: NodeJS.ProcessEnv;
}): AvailabilitySnapshot {
  const env = input.env ?? process.env;
  const config = input.config;
  const activeConnectionId = config.activeProviderConnectionId?.trim() || undefined;
  const connections = (config.providerConnections ?? []).filter(connection => Boolean(connection.id?.trim() && connection.provider));
  const catalogById = new Map(input.catalog.map(provider => [provider.id, provider]));
  const providers: ProviderAvailability[] = [];
  const seen = new Set<string>();

  for (const provider of input.catalog) {
    const declared = connections.filter(connection => connection.provider === provider.runtime);
    const projected = declared.map(connection => projectConnection(config, connection, env));
    const legacy = credentialSources(config, provider.runtime, env);
    const credential = legacy.env || legacy.configApiKey || legacy.configAccount || projected.some(item => item.state === 'ready') ? 'present' : 'missing';
    const state = providerState(projected, credential, true);
    providers.push({ provider: provider.runtime, label: provider.label, catalogued: true, state, credential,
      endpoint: endpointLabel(declared.find(connection => connection.baseUrl)?.baseUrl ?? provider.baseUrl),
      connections: projected, models: provider.models.map(model => ({ id: model.id, ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}) })), measured: 'unknown' });
    seen.add(provider.runtime);
  }
  // A stored connection for a provider the catalogue no longer lists still exists,
  // and saying so is more useful than dropping it from every surface.
  for (const connection of connections) {
    if (seen.has(connection.provider)) continue;
    const projected = [projectConnection(config, connection, env)];
    const legacy = credentialSources(config, connection.provider, env);
    providers.push({ provider: connection.provider, label: connection.label ?? connection.provider, catalogued: false,
      state: providerState(projected, legacy.env || legacy.configApiKey || legacy.configAccount ? 'present' : 'missing', false),
      credential: legacy.env || legacy.configApiKey || legacy.configAccount || projected[0]!.state === 'ready' ? 'present' : 'missing',
      endpoint: endpointLabel(connection.baseUrl), connections: projected, models: [], measured: 'unknown' });
    seen.add(connection.provider);
  }

  const activeConnection = connections.find(connection => connection.id.trim() === activeConnectionId);
  const activeProvider = activeConnection?.provider ?? config.provider ?? 'openai';
  const activeProfile = config.providerCredentials?.[activeProvider];
  return { ...(activeConnectionId ? { activeConnectionId } : {}), activeProvider,
    ...(activeConnection?.model ?? activeProfile?.model ? { activeModel: activeConnection?.model ?? activeProfile?.model } : {}),
    providers };
}

function projectConnection(config: AvailabilityConfig, connection: ProviderConnectionConfig, env: NodeJS.ProcessEnv): ConnectionAvailability {
  const state = connectionState(config, connection, env);
  return { connectionId: connection.id.trim(), provider: connection.provider, authType: connection.authType,
    ...(connection.label ? { label: connection.label } : {}), ...(connection.model ? { model: connection.model } : {}),
    ...(endpointLabel(connection.baseUrl) ? { endpoint: endpointLabel(connection.baseUrl) } : {}), ...state };
}
