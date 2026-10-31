import { catalogBaseUrl, catalogModel, providerEndpoint, type CatalogProvider } from './catalog.js';
import { endpointShape } from '../../provider/endpoints/index.js';
import type { RuntimeConfig } from '../../config/runtimeConfig.js';
import type { ProviderCredentialResolution } from '../auth/credential.js';

export type ServiceTierCapability = 'supported' | 'unsupported' | 'unverified';

/** A matching session choice overrides the request credential's default, which otherwise inherits its provider slot. */
export function configuredServiceTier(config: (Pick<RuntimeConfig, 'providerConnections' | 'providerCredentials'>
  & Partial<Pick<RuntimeConfig, 'sessionServiceTier' | 'activeProviderConnectionId'>>) | undefined,
  resolution: Pick<ProviderCredentialResolution, 'provider' | 'model' | 'credential'>): string | undefined {
  const session = config?.sessionServiceTier;
  const connectionId = resolution.credential?.connectionId;
  if (session && resolution.credential && session.provider === resolution.provider && session.model === resolution.model
    && (session.connectionId === connectionId || (session.connectionScope === undefined && connectionId === undefined
      && session.connectionId === config?.activeProviderConnectionId))) return session.value;
  return config?.providerConnections.find(connection => connection.id === resolution.credential?.connectionId
    && connection.provider === resolution.provider)?.serviceTier ?? config?.providerCredentials[resolution.provider]?.serviceTier;
}

/** Resolve a service tier from the provider/model capability snapshot. */
export function serviceTierCapability(
  catalog: readonly CatalogProvider[],
  provider: string,
  model: string | undefined,
  tier: string | undefined,
  baseUrl?: string,
  endpoint?: string,
): ServiceTierCapability {
  if (tier === undefined) return 'supported';
  const wire = endpointShape(endpoint ?? providerEndpoint(catalog, provider, baseUrl, model)).serviceTiers;
  if (!wire?.includes(tier)) return 'unsupported';
  if (tier === 'default' || tier === 'auto') return 'supported';
  const entry = catalogModel(catalog, provider, model, catalogBaseUrl(catalog, provider, baseUrl));
  if (!entry?.serviceTiers) return 'unverified';
  return entry.serviceTiers.includes(tier) ? 'supported' : 'unsupported';
}
