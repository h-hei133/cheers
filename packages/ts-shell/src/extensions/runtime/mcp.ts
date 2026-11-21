import { mcpServerDefinition, mcpServerName } from '../../core/mcp/config/definition.js';
import type { ScopedMcpServerConfig } from '../../core/mcp/types.js';
import { snapshotData } from '../../core/values/data.js';

/** Session extensions can declare HTTP servers without supplying host credentials. */
export interface ExtensionMcpServer {
  readonly url: string;
  readonly enabled?: boolean;
}

export interface RegisteredMcpServer {
  readonly name: string;
  readonly config: ScopedMcpServerConfig;
}

export const MAX_EXTENSION_MCP_SERVERS = 16;

export function captureExtensionMcpServer(name: unknown, definition: unknown): RegisteredMcpServer {
  if (typeof name !== 'string' || !/^[\w.-]{1,128}$/.test(name)) throw new Error('Invalid extension MCP server name.');
  mcpServerName(name);
  const config = snapshotData(definition, { bytes: 8192, nodes: 16, depth: 2, allowCrossRealm: true });
  if (!config || typeof config !== 'object' || Array.isArray(config)
    || Object.keys(config).some(field => field !== 'url' && field !== 'enabled')) throw new Error('Expected an extension MCP HTTP server definition.');
  const validated = mcpServerDefinition({ ...config, transport: 'http' }, true);
  const address = new URL(validated.url!);
  if (address.search) throw new Error('Extension MCP server URLs cannot contain query parameters.');
  return Object.freeze({ name, config: Object.freeze({ transport: 'http', url: address.href,
    ...(validated.enabled !== undefined ? { enabled: validated.enabled } : {}), scope: 'project' }) });
}
