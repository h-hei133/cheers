import { catalogContributions, observeCatalogContributions } from './contributions.js';
import type { ScopedMcpServerConfig } from '../mcp/types.js';

export function sessionMcpDefinitions(session: () => string) {
  const read = (root: string): Record<string, ScopedMcpServerConfig> => Object.fromEntries(
    catalogContributions(root, session()).flatMap(entry => (entry.mcpServers ?? []).map(server => [server.name, server.config])),
  );
  return {
    read,
    subscribe: (changed: () => void, workspaceRoot: () => string) => {
      let previous = read(workspaceRoot());
      return observeCatalogContributions(undefined, () => {
        const current = read(workspaceRoot());
        const entries = Object.entries(current);
        if (entries.length === Object.keys(previous).length && entries.every(([name, config]) => previous[name] === config)) return;
        previous = current;
        changed();
      });
    },
  };
}
