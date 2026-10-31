import type { CatalogProvider } from '../models/catalog.js';
import type { ProviderCredentialResolution } from './credential.js';
import { providerCredentialBaseUrl, providerCredentialEndpoint } from './account/target.js';
import { endpointShape } from '../../provider/endpoints/index.js';

/** Admission follows the request endpoint; its signer acquires credentials at dispatch. */
export function providerBindingAvailable(catalog: readonly CatalogProvider[], resolution: ProviderCredentialResolution): boolean {
  if (resolution.blocked) return false;
  const baseUrl = providerCredentialBaseUrl(catalog, resolution);
  return Boolean(baseUrl && (resolution.credential
    || endpointShape(providerCredentialEndpoint(catalog, resolution, baseUrl)).signer));
}
