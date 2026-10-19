import { BUILTIN_PROVIDERS, catalogBaseUrl, type CatalogProvider } from '../../models/catalog.js';
import type { ProviderCredentialResolution } from '../credential.js';

/** A model catalogue describes capabilities; it cannot relocate an account credential. */
export function providerCredentialBaseUrl(catalog: readonly CatalogProvider[], resolution: ProviderCredentialResolution): string | undefined {
  const credential = resolution.credential;
  const selected = resolution.baseUrl ?? credential?.baseUrl;
  if (!credential?.accountAuth) return catalogBaseUrl(catalog, resolution.provider, selected);
  const issued = credential.accountAuth.type === 'subscription' ? credential.accountAuth.baseUrl : undefined;
  if (issued && selected && issued.trim().replace(/\/+$/, '') !== selected.trim().replace(/\/+$/, '')) {
    throw new Error('The selected endpoint differs from the account credential binding.');
  }
  const owner = issued ?? selected ?? BUILTIN_PROVIDERS.find(provider => provider.id === resolution.provider)?.baseUrl;
  const fallback = catalogBaseUrl(catalog, resolution.provider);
  if (!selected && !issued && fallback !== undefined && fallback.trim().replace(/\/+$/, '') !== owner?.trim().replace(/\/+$/, '')) {
    throw new Error('The model catalogue cannot override an account credential endpoint. Configure its owner explicitly.');
  }
  return owner;
}
