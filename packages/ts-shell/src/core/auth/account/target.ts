import { BUILTIN_PROVIDERS, catalogBaseUrl, providerEndpoint, type CatalogProvider } from '../../models/catalog.js';
import type { ProviderCredentialResolution } from '../credential.js';
import { accountProtocol, assertAccountAddress } from './policy.js';

type CredentialTarget = Pick<ProviderCredentialResolution, 'credential' | 'baseUrl'> & { readonly provider: string };

/** A model catalogue describes capabilities; it cannot relocate an account credential. */
export function providerCredentialBaseUrl(catalog: readonly CatalogProvider[], resolution: CredentialTarget): string | undefined {
  const credential = resolution.credential;
  const selected = resolution.baseUrl ?? credential?.baseUrl;
  if (!credential?.accountAuth) return catalogBaseUrl(catalog, resolution.provider, selected);
  assertAccountAddress(credential.accountAuth, selected);
  const policy = accountProtocol(credential.accountAuth);
  if (policy) return policy.baseUrl;
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

/** Account protocols come from the issuer; API keys keep catalogue selection. */
export function providerCredentialEndpoint(catalog: readonly CatalogProvider[], resolution: CredentialTarget, baseUrl?: string): string | undefined {
  return accountProtocol(resolution.credential?.accountAuth)?.endpoint ?? providerEndpoint(catalog, resolution.provider, baseUrl);
}
