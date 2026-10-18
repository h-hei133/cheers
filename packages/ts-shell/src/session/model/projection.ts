import { isRuntimeProvider, type RuntimeConfig } from "../../config/runtimeConfig.js";
import { readSessionModel } from "./state.js";
import { sessionModelOrigins } from '../../config/provenance/projection.js';
import type { SessionModelSelection } from './contract.js';

type ModelConfig = Partial<Pick<RuntimeConfig, "provider" | "activeProviderConnectionId" | "sessionConnection" | "sessionModelRoles" | "providerConnections" | "providerCredentials" | "configProvenance" | "contextWindow">>;

/** Overlay a session preference without mutating shared defaults or credentials. */
export function projectSessionModel<T extends ModelConfig>(config: T, sessionId?: string): T {
  return projectModelSelection(config, readSessionModel(sessionId));
}

/** Also used to validate the exact next request target before saving it. */
export function projectModelSelection<T extends ModelConfig>(config: T, selection?: SessionModelSelection): T {
  if (!selection || (selection.connectionScope === undefined && config.activeProviderConnectionId !== selection.connectionId)) return config;
  const providerSlot = selection.connectionScope === 'provider';
  const connection = config.providerConnections?.find(item => item.id === selection.connectionId);
  const binding = providerSlot
    ? { activeProviderConnectionId: undefined, sessionConnection: { scope: 'provider' as const, provider: selection.provider } }
    : selection.connectionScope === 'session'
    ? { activeProviderConnectionId: selection.connectionId, sessionConnection: { id: selection.connectionId, provider: selection.provider } } : {};
  if (!providerSlot && (!connection || connection.provider !== selection.provider)) return selection.connectionScope === 'session' ? { ...config, ...binding } : config;
  if (!isRuntimeProvider(selection.provider)) return { ...config, ...binding };
  const preference = { model: selection.model, ...(selection.thinkingEffort !== undefined ? { thinkingEffort: selection.thinkingEffort } : {}), ...(selection.serviceTier !== undefined ? { serviceTier: selection.serviceTier } : {}) };
  return {
    ...config,
    ...binding,
    ...(selection.roles ? { sessionModelRoles: selection.roles } : {}),
    ...(selection.connectionScope ? { provider: selection.provider } : {}),
    ...(selection.contextWindow !== undefined ? { contextWindow: selection.contextWindow } : {}),
    ...(config.configProvenance ? { configProvenance: sessionModelOrigins(config.configProvenance, connection ? config.providerConnections!.indexOf(connection) : undefined, selection.provider, selection.thinkingEffort !== undefined, Boolean(selection.connectionScope)) } : {}),
    providerConnections: config.providerConnections?.map(item => item === connection ? { ...item, ...preference } : item),
    providerCredentials: {
      ...config.providerCredentials,
      [selection.provider]: { ...config.providerCredentials?.[selection.provider], ...preference },
    },
  };
}
