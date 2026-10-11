import { catalogModel, providerEndpoint, type CatalogProvider } from './catalog.js';
import { endpointShape } from '../../provider/endpoints/index.js';

export type ServiceTierCapability = 'supported' | 'unsupported' | 'unverified';

/** Resolve a service tier from the provider/model capability snapshot. */
export function serviceTierCapability(
  catalog: readonly CatalogProvider[],
  provider: string,
  model: string | undefined,
  tier: string | undefined,
): ServiceTierCapability {
  if (tier === undefined) return 'supported';
  const wire = endpointShape(providerEndpoint(catalog, provider)).serviceTiers;
  if (!wire?.includes(tier)) return 'unsupported';
  if (tier === 'default' || tier === 'auto') return 'supported';
  const entry = catalogModel(catalog, provider, model);
  if (!entry?.serviceTiers) return 'unverified';
  return entry.serviceTiers.includes(tier) ? 'supported' : 'unsupported';
}
