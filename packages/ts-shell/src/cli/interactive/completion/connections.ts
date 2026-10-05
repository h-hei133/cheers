import { readUserRuntimeConfigFile } from "../../../config/runtimeConfig.js";
import { normalizeConnections } from "../../../core/commands/connect/preset.js";
import type { Suggestion } from "../../../presentation/tui/chrome/suggestions.js";

/** Match the command's saved connection source, exposing identity metadata only. */
export function connectionCatalog(): readonly Suggestion[] {
  return normalizeConnections(readUserRuntimeConfigFile()).map(connection => ({
    value: connection.id, label: connection.label || connection.id,
    detail: `${connection.id} · ${connection.provider} · saved: ${connection.status}`,
  }));
}
