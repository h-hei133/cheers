import fs from 'node:fs';
import { catalogContributions, observeCatalogContributions } from './contributions.js';
import type { ScopedMcpServerConfig } from '../mcp/types.js';
import { loadMcpConfigs } from '../mcp/config.js';
import { userDataSearchDirs } from '../paths/userHome.js';
import { observeDirectory } from '../state/watch.js';
import { sameValue } from '../../config/values.js';

function installedMcpDefinitions(root: string, session: string): [string, ScopedMcpServerConfig][] {
  let workspace: string;
  try { workspace = fs.realpathSync(root); } catch { return []; }
  const servers = catalogContributions(workspace, session).flatMap(entry => entry.stdioMcpServers ?? []);
  if (!servers.length) return [];
  const approvals = loadMcpConfigs(root, false, undefined, 'all');
  return servers.flatMap(server => {
    const config = approvals[server.name];
    const approval = config?.extension;
    if (!config || !approval || approval.workspace !== workspace || approval.workspace !== server.approval.workspace
      || approval.packageId !== server.approval.packageId || approval.digest !== server.approval.digest
      || config.command !== server.command || !sameValue(config.args, server.args)) return [];
    try { server.assertCurrent(); } catch { return []; }
    return [[server.name, { transport: 'stdio', command: server.command, args: [...server.args],
      enabled: config.enabled !== false, scope: 'user', sourcePath: config.sourcePath,
      extension: server.approval, extensionOwner: server.extensionOwner }]];
  });
}

export function sessionMcpDefinitions(session: () => string) {
  const read = (root: string): Record<string, ScopedMcpServerConfig> => {
    const sessionId = session();
    return Object.fromEntries([
      ...installedMcpDefinitions(root, sessionId),
      ...catalogContributions(root, sessionId).flatMap(entry => (entry.mcpServers ?? []).map(server => [server.name, server.config])),
    ]);
  };
  return {
    read,
    subscribe: (changed: () => void, workspaceRoot: () => string) => {
      const currentDefinitions = () => {
        try { return read(workspaceRoot()); } catch { return undefined; }
      };
      let previous = currentDefinitions();
      const refresh = () => {
        const current = currentDefinitions();
        if (sameValue(current, previous)) return;
        previous = current;
        changed();
      };
      const retire = observeCatalogContributions(undefined, refresh);
      const unwatch = userDataSearchDirs().map(dir => observeDirectory(dir, refresh));
      return () => { retire(); unwatch.forEach(close => close()); };
    },
  };
}
