import type { RuntimeConfig } from "../../config/runtimeConfig.js";
import { readSessionModel } from "./state.js";
import { sessionModelOrigins } from '../../config/provenance/projection.js';

/** Overlay a session preference without mutating shared defaults or credentials. */
export function projectSessionModel<T extends Partial<Pick<RuntimeConfig, "activeProviderConnectionId" | "providerConnections" | "providerCredentials" | "configProvenance">>>(config: T, sessionId?: string): T {
  const selection = readSessionModel(sessionId);
  if (!selection || config.activeProviderConnectionId !== selection.connectionId) return config;
  const connection = config.providerConnections?.find(item => item.id === selection.connectionId);
  if (!connection || connection.provider !== selection.provider) return config;
  return {
    ...config,
    ...(config.configProvenance ? { configProvenance: sessionModelOrigins(config.configProvenance, config.providerConnections!.indexOf(connection), selection.provider) } : {}),
    providerConnections: config.providerConnections?.map(item => item === connection ? { ...item, model: selection.model } : item),
    providerCredentials: {
      ...config.providerCredentials,
      [selection.provider]: { ...config.providerCredentials?.[selection.provider], model: selection.model },
    },
  };
}
