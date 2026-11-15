import { isRuntimeProvider, type RuntimeConfig } from "../../config/runtimeConfig.js";
import { readSessionModelStrict } from "./state.js";
import { sessionModelOrigins } from '../../config/provenance/projection.js';
import type { SessionModelSelection } from './contract.js';

type ModelConfig = Partial<Pick<RuntimeConfig, "provider" | "activeProviderConnectionId" | "sessionConnection" | "sessionModelRoles" | "sessionServiceTier" | "sessionContextWindow" | "providerConnections" | "providerCredentials" | "configProvenance" | "contextWindow">>;

/** Overlay a session preference without mutating shared defaults or credentials. */
export function projectSessionModel<T extends ModelConfig>(config: T, sessionId?: string): T {
  return projectModelSelection(config, readSessionModelStrict(sessionId));
}

/** Also used to validate the exact next request target before saving it. */
export function projectModelSelection<T extends ModelConfig>(config: T, selection?: SessionModelSelection): T {
  if (!selection) return config;
  // Independent roles survive a dormant or unavailable default binding.
  if (selection.virtualModel && selection.roles) config = { ...config, sessionModelRoles: selection.roles };
  if (selection.connectionScope === undefined && config.activeProviderConnectionId !== selection.connectionId) return config;
  const providerSlot = selection.connectionScope === 'provider';
  const connection = config.providerConnections?.find(item => item.id === selection.connectionId);
  const binding = providerSlot
    ? { activeProviderConnectionId: undefined, sessionConnection: { scope: 'provider' as const, provider: selection.provider } }
    : selection.connectionScope === 'session'
    ? { activeProviderConnectionId: selection.connectionId, sessionConnection: { id: selection.connectionId, provider: selection.provider } } : {};
  if (!providerSlot && (!connection || connection.provider !== selection.provider)) return selection.connectionScope === 'session' ? { ...config, ...binding } : config;
  if (!isRuntimeProvider(selection.provider)) return { ...config, ...binding };
  const preference = { ...(selection.model !== undefined ? { model: selection.model } : {}), ...(selection.thinkingEffort !== undefined ? { thinkingEffort: selection.thinkingEffort } : {}) };
  return {
    ...config,
    ...binding,
    sessionServiceTier: selection.virtualModel || selection.serviceTier === undefined || selection.model === undefined ? undefined : {
      provider: selection.provider, model: selection.model, value: selection.serviceTier,
      ...(selection.connectionId !== undefined ? { connectionId: selection.connectionId } : {}),
      ...(selection.connectionScope !== undefined ? { connectionScope: selection.connectionScope } : {}),
    },
    ...(selection.roles ? { sessionModelRoles: selection.roles } : {}),
    ...(selection.connectionScope ? { provider: selection.provider } : {}),
    sessionContextWindow: selection.virtualModel || selection.contextWindow === undefined || selection.model === undefined ? undefined : {
      provider: selection.provider, model: selection.model, value: selection.contextWindow,
      ...(selection.connectionId !== undefined ? { connectionId: selection.connectionId } : {}),
      ...(selection.connectionScope !== undefined ? { connectionScope: selection.connectionScope } : {}),
    },
    ...(config.configProvenance ? { configProvenance: sessionModelOrigins(config.configProvenance, connection ? config.providerConnections!.indexOf(connection) : undefined, selection.provider, selection.thinkingEffort !== undefined, Boolean(selection.connectionScope)) } : {}),
    providerConnections: config.providerConnections?.map(item => item === connection ? { ...item, ...preference } : item),
    ...(providerSlot ? { providerCredentials: {
      ...config.providerCredentials,
      [selection.provider]: { ...config.providerCredentials?.[selection.provider], ...preference },
    } } : {}),
  };
}
