import type { CatalogProvider } from '../models/catalog.js';
import type { ProviderCredentialResolution } from './credential.js';
import { providerCredentialBaseUrl, providerCredentialEndpoint } from './account/target.js';
import { declaredEndpointKinds, DEFAULT_ENDPOINT_KIND, endpointShape } from '../../provider/endpoints/index.js';

/** Explicit request scope can differ from the saved connection default. */
export function providerScopeSelected(config: { readonly activeProviderConnectionId?: string }, resolution: ProviderCredentialResolution): boolean {
  return resolution.credential?.connectionId === undefined && resolution.selection?.connectionId === undefined
    && (resolution.selection?.credentialScope === 'provider' || !config.activeProviderConnectionId);
}

/** Admission follows the request endpoint; its signer acquires credentials at dispatch. */
export function providerBindingAvailable(catalog: readonly CatalogProvider[], resolution: ProviderCredentialResolution): boolean {
  if (resolution.blocked) return false;
  const baseUrl = providerCredentialBaseUrl(catalog, resolution);
  if (!baseUrl) return false;
  const endpoint = providerCredentialEndpoint(catalog, resolution, baseUrl);
  if (!declaredEndpointKinds().includes(endpoint ?? DEFAULT_ENDPOINT_KIND)) return false;
  return Boolean(resolution.credential || endpointShape(endpoint).signer);
}
