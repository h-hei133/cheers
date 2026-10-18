import { isRuntimeProvider, type RuntimeConfig } from '../../config/runtimeConfig.js';
import { resolveProviderCredential, type ProviderCredentialResolution } from '../../core/shell/providerCredentials.js';
import { providerFacts } from '../../core/providers/facts.js';
import type { SessionModelRole } from '../../session/model/contract.js';
import { catalogBaseUrl, type CatalogProvider } from '../../core/models/catalog.js';

/** An exact target names an existing connection or provider; a bare model stays on its captured provider. */
export function delegatedTarget(target: string | SessionModelRole, main: ProviderCredentialResolution, config?: RuntimeConfig,
  catalog: readonly CatalogProvider[] = [], providerScope?: 'current'): ProviderCredentialResolution {
  const text = typeof target === 'string' ? target : target.model;
  if (!text.trim() || text !== text.trim() || /[\s\x00-\x1f\x7f-\x9f]/.test(text) || text.length > 512) throw new Error('Delegated model target is invalid.');
  const slash = text.indexOf('/'); const owner = typeof target !== 'string' ? target.connectionId : slash < 0 ? main.provider : text.slice(0, slash);
  const model = typeof target !== 'string' || slash < 0 ? text : text.slice(slash + 1);
  if (!model) throw new Error('Delegated model target is unavailable.');
  const matches = providerScope === 'current' ? [] : config?.providerConnections.filter(item => item.id === owner) ?? [];
  if (matches.length > 1) throw new Error('Delegated connection is ambiguous.');
  const connection = matches[0];
  if (typeof target !== 'string' && (!connection || connection.provider !== target.provider)) throw new Error('Delegated role connection is unavailable.');
  if (config?.accountPool?.[main.provider] && (connection?.provider ?? owner) !== main.provider) {
    throw new Error('Delegated provider is unavailable outside the parent account pool.');
  }
  let resolution: ProviderCredentialResolution;
  if (connection) {
    if (connection.status === 'pending' || connection.status === 'error') throw new Error('Delegated connection is unavailable.');
    resolution = resolveProviderCredential({ runtimeConfig: { ...config!, activeProviderConnectionId: connection.id,
      sessionConnection: { id: connection.id, provider: connection.provider } },
      cliProvider: connection.provider, cliModel: model, env: {} });
    if (resolution.credential?.connectionId !== connection.id) throw new Error('Delegated connection has no usable credential.');
  } else if (owner === main.provider) {
    if (config?.accountPool?.[main.provider]) {
      const id = main.credential?.connectionId;
      resolution = resolveProviderCredential({ runtimeConfig: { ...config, provider: main.provider, activeProviderConnectionId: id,
        sessionConnection: id ? { id, provider: main.provider } : { scope: 'provider', provider: main.provider } },
        cliProvider: main.provider, cliModel: model, env: {} });
    } else resolution = { ...main, model, ...(main.credential ? { credential: { ...main.credential, model } } : {}) };
  } else {
    if (!config || !isRuntimeProvider(owner)) throw new Error('Delegated provider is unavailable.');
    resolution = resolveProviderCredential({ runtimeConfig: { ...config, sessionConnection: undefined }, cliProvider: owner, cliModel: model });
  }
  if (resolution.model !== model || !resolution.credential
    || !catalogBaseUrl(catalog, resolution.provider, resolution.baseUrl ?? resolution.credential.baseUrl)) throw new Error('Delegated model has no usable provider binding.');
  const allowed = providerFacts(resolution.provider).accountAuthAllowedModels;
  if (resolution.credential.authMode === 'account-auth' && allowed && !allowed.includes(model)) throw new Error('Delegated model is unavailable for this account binding.');
  return resolution;
}
