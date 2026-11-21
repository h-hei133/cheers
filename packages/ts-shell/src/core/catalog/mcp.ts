import { catalogContributions, observeCatalogContributions } from './contributions.js';
import type { ScopedMcpServerConfig } from '../mcp/types.js';

export function sessionMcpDefinitions(session: () => string) {
  return {
    read: (root: string): Record<string, ScopedMcpServerConfig> => Object.fromEntries(
      catalogContributions(root, session()).flatMap(entry => (entry.mcpServers ?? []).map(server => [server.name, server.config])),
    ),
    subscribe: (changed: () => void) => observeCatalogContributions(undefined, changed),
  };
}
