import { isRuntimeProvider, type RuntimeConfig } from '../../config/runtimeConfig.js';
import { resolveProviderCredential, type ProviderCredentialResolution } from '../../core/shell/providerCredentials.js';
import { providerFacts } from '../../core/providers/facts.js';

/** An exact target names an existing connection or provider; a bare model stays on its captured provider. */
export function delegatedTarget(target: string, main: ProviderCredentialResolution, config?: RuntimeConfig): ProviderCredentialResolution {
  if (!target.trim() || target !== target.trim() || /[\s\x00-\x1f\x7f-\x9f]/.test(target) || target.length > 512) throw new Error('Delegated model target is invalid.');
  const slash = target.indexOf('/'); const owner = slash < 0 ? main.provider : target.slice(0, slash);
  const model = slash < 0 ? target : target.slice(slash + 1);
  if (!model) throw new Error('Delegated model target is unavailable.');
  const connection = config?.providerConnections.find(item => item.id === owner);
  let resolution: ProviderCredentialResolution;
  if (connection) {
    if (connection.status === 'pending' || connection.status === 'error') throw new Error('Delegated connection is unavailable.');
    resolution = resolveProviderCredential({ runtimeConfig: { ...config!, providerConnections: [connection], activeProviderConnectionId: connection.id,
      sessionConnection: { id: connection.id, provider: connection.provider } },
      cliProvider: connection.provider, cliModel: model, env: {} });
    if (resolution.credential?.connectionId !== connection.id) throw new Error('Delegated connection has no usable credential.');
  } else if (owner === main.provider) {
    resolution = { ...main, model, ...(main.credential ? { credential: { ...main.credential, model } } : {}) };
  } else {
    if (!config || !isRuntimeProvider(owner)) throw new Error('Delegated provider is unavailable.');
    resolution = resolveProviderCredential({ runtimeConfig: { ...config, sessionConnection: undefined }, cliProvider: owner, cliModel: model });
  }
  if (resolution.model !== model || !resolution.credential || !resolution.baseUrl) throw new Error('Delegated model has no usable provider binding.');
  const allowed = providerFacts(resolution.provider).accountAuthAllowedModels;
  if (resolution.credential.authMode === 'account-auth' && allowed && !allowed.includes(model)) throw new Error('Delegated model is unavailable for this account binding.');
  return resolution;
}
