import { catalogBaseUrl, catalogModel, providerEndpoint, type CatalogProvider } from './catalog.js';
import { endpointShape } from '../../provider/endpoints/index.js';

export type ServiceTierCapability = 'supported' | 'unsupported' | 'unverified';

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
