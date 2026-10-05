import { loadMcpConfigs } from "../../../core/mcp/config.js";
import { projectTrust } from "../../../core/security/projectTrust.js";
import type { Suggestion } from "../../../presentation/tui/chrome/suggestions.js";

/** Names need configuration only: do not connect, refresh, or authenticate here. */
export function serverCatalog(workspaceRoot: string): readonly Suggestion[] {
  const configs = loadMcpConfigs(workspaceRoot, !projectTrust.isProjectUntrusted(workspaceRoot));
  return Object.entries(configs).map(([name, config]) => ({
    value: name, label: name,
    detail: `${config.scope} · ${config.enabled === false ? "disabled" : "configured"}`,
  }));
}
