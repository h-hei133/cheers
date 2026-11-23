import type { RuntimeConfig } from "../../../config/runtimeConfig.js";
import { getRuntimeConfig } from "../../../config/runtimeConfig.js";
import type { ProviderCredentialResolution } from "../../../core/auth/credential.js";
import { catalogAvailabilitySnapshot } from "../../../core/models/availability.js";
import { isUserConfiguredModel, type CatalogProvider } from "../../../core/models/catalog.js";
import { loadCatalog } from "../../../core/models/catalogStore.js";
import { resolveProviderCredential } from "../../../core/shell/providerCredentials.js";
import { modelSyntax, parseModelArgs } from "../../../core/commands/model/syntax.js";
import { firstParameter } from "./position.js";
import type { Suggestion } from "../../../presentation/tui/chrome/suggestions.js";
import type { VirtualModelMetadata } from '../../../core/models/virtual/contract.js';

export interface ModelCatalogContext {
  readonly config?: RuntimeConfig;
  readonly env?: NodeJS.ProcessEnv;
}

export function modelKind(before: readonly string[], current: string, after: readonly string[]): "model" | "provider" | undefined {
  if (!before.length && modelSyntax.actions.some(action => action.name && (action.name === current.toLowerCase() || action.aliases?.includes(current.toLowerCase())))) return undefined;
  const parsed = firstParameter(parseModelArgs, before, after);
  if (!parsed) return undefined;
  return parsed.action.name === "use" ? "model" : parsed.action.name === "list" ? "provider" : undefined;
}

/**
 * Slash completion has no explicit Registry selector, so it suggests only ready
 * targets and providers the user explicitly added to models.json. The interactive
 * model browser remains the path to the full catalogue.
 */
export function modelCatalog(kind: "model" | "provider", catalog: readonly CatalogProvider[] = loadCatalog(),
  virtual: readonly VirtualModelMetadata[] = [], context: ModelCatalogContext = {}): readonly Suggestion[] {
  const config = context.config ?? getRuntimeConfig();
  const env = context.env ?? process.env;
  const active = resolveProviderCredential({ runtimeConfig: config, env });
  const resolveLocal = (provider: RuntimeConfig["provider"], connectionId?: string): ProviderCredentialResolution => {
    const targetConfig = {
      ...config,
      provider,
      activeProviderConnectionId: connectionId,
      sessionConnection: undefined,
      ...(connectionId === undefined ? { providerConnections: [] } : {}),
    };
    return resolveProviderCredential({ runtimeConfig: targetConfig, env });
  };
  const ready = new Set(catalogAvailabilitySnapshot({ config, catalog, active, resolveLocal })
    .filter(entry => entry.state === 'ready' || entry.state === 'signed').map(entry => entry.id));
  const configured = catalog.filter(provider => ready.has(provider.id)
    || provider.models.some(model => isUserConfiguredModel(provider, model.id)));

  if (kind === "provider") {
    return [...new Set([...configured.map(provider => provider.id), ...virtual.map(model => model.provider)])]
      .map(value => ({ value, label: value }));
  }
  return [...configured.flatMap(provider => provider.models
    .filter(model => ready.has(provider.id) || isUserConfiguredModel(provider, model.id)).map(model => ({
    value: `${provider.id}/${model.id}`, label: `${provider.id}/${model.id}`,
  }))), ...virtual.map(model => ({ value: `${model.provider}/${model.id}`, label: `${model.provider}/${model.id}` }))];
}
