import { catalogProvider, type CatalogProvider } from '../models/catalog.js';
import type { ProviderCredentialResolution } from '../auth/credential.js';
import { providerCredentialEndpoint } from '../auth/account/target.js';
import { catalogContributions, contributedProviders } from './contributions.js';
import type { SessionExtensionProvider } from '../../session/model/contract.js';
import { readSessionModelStrict } from '../../session/model/state.js';
import type { Admission } from '../network/admission.js';
import { EXTENSION_MODEL_PREFIX } from '../../extensions/runtime/provider.js';

export { EXTENSION_MODEL_PREFIX } from '../../extensions/runtime/provider.js';
const MODEL_UNAVAILABLE = 'The selected extension model or configured endpoint is unavailable. Reload the extension or choose another model.';

export function extensionModelReference(value: string | undefined): { readonly id: string; readonly model: string } | undefined {
  if (!value?.startsWith(EXTENSION_MODEL_PREFIX)) return undefined;
  const slash = value.indexOf('/');
  if (slash < EXTENSION_MODEL_PREFIX.length + 1 || slash === value.length - 1) return undefined;
  return { id: value.slice(EXTENSION_MODEL_PREFIX.length, slash), model: value.slice(slash + 1) };
}

export function sessionProviders(root: string, sessionId: string) {
  return catalogContributions(root, sessionId).flatMap(contributedProviders);
}

/** Extension metadata can describe an explicit credential endpoint without changing its address or protocol. */
export function sessionProviderScope(root: string, sessionId: string, physical: readonly CatalogProvider[], resolution: ProviderCredentialResolution,
  selection?: SessionExtensionProvider): { readonly catalog: readonly CatalogProvider[]; readonly admission?: Admission; readonly registration?: CatalogProvider } {
  const unavailable = () => ({ catalog: physical, ...(selection || resolution.model?.startsWith(EXTENSION_MODEL_PREFIX) ? { admission: () => MODEL_UNAVAILABLE } : {}) });
  const address = resolution.baseUrl ?? resolution.credential?.baseUrl;
  if (!address || resolution.blocked || resolution.credential?.authMode !== 'api-key' || resolution.credential.accountAuth) {
    return unavailable();
  }
  const base = address.replace(/\/+$/, '');
  const registered = sessionProviders(root, sessionId).find(provider => provider.runtime === resolution.provider && provider.baseUrl === base);
  if (!registered || resolution.model?.startsWith(EXTENSION_MODEL_PREFIX) || selection
    && (registered.id !== selection.id || base !== selection.baseUrl || !registered.models.some(model => model.id === resolution.model))) return unavailable();
  const existing = catalogProvider(physical, resolution.provider, address);
  if (existing.ambiguous || physical.some(provider => provider.id === registered.id)) return unavailable();
  const alias = existing.entry?.id !== resolution.provider ? existing.entry : undefined;
  const models = new Map(existing.entry?.models.map(model => [model.id, model]));
  for (const model of registered.models) models.set(model.id, Object.freeze({ ...models.get(model.id), ...model }));
  const selected = Object.freeze({ ...registered, ...alias, endpoint: providerCredentialEndpoint(physical, resolution, address), models: Object.freeze([...models.values()]) });
  return { catalog: Object.freeze(alias ? physical.map(provider => provider === alias ? selected : provider) : [...physical, selected]), registration: registered,
    admission: () => sessionProviders(root, sessionId).includes(registered) ? undefined : 'Extension provider registration changed. Start a new request.' };
}

export function currentSessionProviderScope(root: string, sessionId: string, physical: readonly CatalogProvider[], resolution: ProviderCredentialResolution) {
  const saved = readSessionModelStrict(sessionId);
  if (saved?.extensionProvider && (saved.provider !== resolution.provider || saved.model !== resolution.model
    || saved.connectionId !== resolution.credential?.connectionId)) return { catalog: physical, admission: () => MODEL_UNAVAILABLE };
  return sessionProviderScope(root, sessionId, physical, resolution, saved?.extensionProvider);
}
