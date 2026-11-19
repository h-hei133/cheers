import type { RuntimeConfig } from '../../config/runtimeConfig.js';
import { sameValue } from '../../config/values.js';
import { createComponentLogger } from '../../observability/structuredLogger.js';
import type { CoreMcpGateway } from '../mcp/gateway.js';
import { MCP_TOOL_PREFIX, mcpServerToolPrefix } from '../mcp/projection.js';
import { describeMcpConnectionState, McpGatewayBlockedError } from '../mcp/status.js';
import type { McpServerFilter, McpToolDescriptor } from '../mcp/types.js';
import type { Admission } from '../network/admission.js';
import { filterVisibleToolNames } from './prefilter.js';

export type ToolMcpGateway = Pick<CoreMcpGateway, 'snapshot'> & Partial<Pick<CoreMcpGateway, 'invokeTool'>>;

/** False skips discovery. Undefined keeps every configured server eligible. */
export function mcpCatalogFilter(config?: RuntimeConfig, forcedTool?: string, captured?: readonly McpToolDescriptor[]): McpServerFilter | false | undefined {
  if (config?.enableMcpTools !== true || config.hiddenToolPrefixes.some(prefix => MCP_TOOL_PREFIX.startsWith(prefix))) return false;
  // The scripting tool can use any visible tool in its nested catalog.
  const allowed = forcedTool && forcedTool !== 'codemode' ? [forcedTool] : config.allowedTools;
  if (captured !== undefined) {
    const visible = new Set(filterVisibleToolNames(captured.map(tool => tool.qualifiedName), config));
    const servers = new Set(captured.filter(tool => visible.has(tool.qualifiedName) && (!allowed || allowed.includes(tool.qualifiedName)))
      .map(tool => tool.serverName));
    return servers.size > 0 ? server => servers.has(server) : false;
  }

  const names = allowed && filterVisibleToolNames(allowed.filter(name => name.startsWith(MCP_TOOL_PREFIX)), config);
  if (names?.length === 0) return false;
  const hidden = config.hiddenToolPrefixes.filter(prefix => prefix.startsWith(MCP_TOOL_PREFIX));
  if (!names && !hidden.length) return undefined;
  return server => {
    // Test against configured owners because underscores at a boundary can
    // make the qualified spelling match more than one server prefix.
    const prefix = mcpServerToolPrefix(server);
    return !hidden.some(value => prefix.startsWith(value)) && (!names || names.some(name => name.startsWith(prefix)));
  };
}

/** Include only live descriptors that the existing tool gate can expose. */
export async function mcpToolsForRun(request: { readonly runtimeConfig?: RuntimeConfig; readonly forcedTool?: string;
  readonly catalogContent?: { readonly mcpTools?: readonly McpToolDescriptor[] }; readonly mcpGateway?: ToolMcpGateway;
  readonly admission?: Admission; readonly signal?: AbortSignal }): Promise<{
    readonly tools: readonly McpToolDescriptor[];
    readonly gateway: Pick<CoreMcpGateway, 'invokeTool'> | undefined;
  } | undefined> {
  const gateway = request.mcpGateway;
  if (!gateway) return undefined;
  const captured = request.catalogContent && (request.catalogContent.mcpTools ?? []);
  const filter = mcpCatalogFilter(request.runtimeConfig, request.forcedTool, captured);
  if (filter === false) return undefined;
  try {
    const snapshot = await gateway.snapshot(request.admission, request.signal, filter);
    const unavailable = snapshot.clients.flatMap(client => {
      return client.type === 'connected' ? [] : [`${client.name} (${client.type}). ${describeMcpConnectionState(client).doNext}`];
    });
    if (unavailable.length) createComponentLogger('mcp').warn(`MCP tools unavailable this run. ${unavailable.join(' ')}`);
    const tools = captured ? snapshot.tools.filter(tool => captured.some(saved => sameValue(saved, tool))) : snapshot.tools;
    if (!tools.length) return undefined;
    return { tools, gateway: gateway.invokeTool ? {
      invokeTool: (server, tool, args, _admission, options) => gateway.invokeTool!(server, tool, args, request.admission, options),
    } : undefined };
  } catch (error) {
    request.signal?.throwIfAborted();
    const details = error instanceof McpGatewayBlockedError ? ` ${error.mcpSafeDetail} ${error.doNext}` : '';
    createComponentLogger('mcp').warn(`MCP tool discovery failed.${details}`);
    return undefined;
  }
}
