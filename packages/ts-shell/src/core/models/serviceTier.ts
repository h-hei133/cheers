import { catalogBaseUrl, catalogModel, providerEndpoint, type CatalogProvider } from './catalog.js';
import { endpointShape } from '../../provider/endpoints/index.js';
import { isRuntimeProvider, type RuntimeConfig } from '../../config/runtimeConfig.js';
import { sessionPreferenceMatches, type ModelPreferenceTarget } from './preference.js';

export type ServiceTierCapability = 'supported' | 'unsupported' | 'unverified';

/** A matching session choice overrides the request credential's default, which otherwise inherits its provider slot. */
export function configuredServiceTier(config: (Pick<RuntimeConfig, 'providerConnections' | 'providerCredentials'>
  & Partial<Pick<RuntimeConfig, 'sessionServiceTier' | 'activeProviderConnectionId'>>) | undefined,
  resolution: ModelPreferenceTarget): string | undefined {
  const session = config?.sessionServiceTier;
  if (sessionPreferenceMatches(config, session, resolution)) return session!.value;
  return config?.providerConnections?.find(connection => connection.id === resolution.credential?.connectionId
    && connection.provider === resolution.provider)?.serviceTier
    ?? (isRuntimeProvider(resolution.provider) ? config?.providerCredentials?.[resolution.provider]?.serviceTier : undefined);
}

/** Capture the actual request's tier and refuse unsupported controls before dispatch. */
export function requestServiceTier(config: RuntimeConfig | undefined, resolution: ModelPreferenceTarget,
  catalog: readonly CatalogProvider[], baseUrl?: string, endpoint?: string, override?: string): string | undefined {
  const tier = override ?? configuredServiceTier(config, resolution);
  if (tier && serviceTierCapability(catalog, resolution.provider, resolution.model, tier, baseUrl, endpoint) !== 'supported') {
    throw new Error(`Configured service tier '${tier}' is not verified for ${resolution.provider}/${resolution.model}.`);
  }
  return tier;
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
