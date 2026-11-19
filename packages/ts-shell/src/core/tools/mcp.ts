import type { RuntimeConfig } from '../../config/runtimeConfig.js';
import { sameValue } from '../../config/values.js';
import { createComponentLogger } from '../../observability/structuredLogger.js';
import type { ToolDefinition, ToolExecutionContext } from '../../tools/types.js';
import { MCP_CATALOG_BYTES, MCP_CATALOG_TOOLS, McpCatalogLimitError } from '../mcp/catalogLimit.js';
import { classifyMcpFailure, classifyUnknownMcpFailure, mcpFailureMetadata } from '../mcp/errorTaxonomy.js';
import type { CoreMcpGateway } from '../mcp/gateway.js';
import { MCP_TOOL_PREFIX, mcpServerToolPrefix } from '../mcp/projection.js';
import { describeMcpConnectionState, McpGatewayBlockedError } from '../mcp/status.js';
import type { McpServerFilter, McpToolDescriptor } from '../mcp/types.js';
import { assertAdmission, type Admission } from '../network/admission.js';
import { filterVisibleToolNames } from './prefilter.js';
import { approvedResult, deniedResult, runtimeErrorResult } from './toolResultLifecycle.js';

type McpInvoker = Pick<CoreMcpGateway, 'invokeTool'>;
export type ToolMcpGateway = Pick<CoreMcpGateway, 'snapshot'> & Partial<McpInvoker>;

/** False skips discovery. Undefined keeps every configured server eligible. */
export function mcpCatalogFilter(config?: RuntimeConfig, forcedTool?: string, captured?: readonly McpToolDescriptor[],
  reached?: readonly string[]): McpServerFilter | false | undefined {
  if (config?.enableMcpTools !== true || config.hiddenToolPrefixes.some(prefix => MCP_TOOL_PREFIX.startsWith(prefix))) return false;
  // The scripting tool can use any visible tool in its nested catalog.
  const configured = forcedTool && forcedTool !== 'codemode' ? [forcedTool] : config.allowedTools;
  const allowed = reached === undefined ? configured : reached.filter(name => !configured || configured.includes(name));
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

interface McpRunInput { readonly runtimeConfig?: RuntimeConfig; readonly forcedTool?: string;
  readonly catalogContent?: { readonly mcpTools?: readonly McpToolDescriptor[] }; readonly mcpGateway?: ToolMcpGateway;
  readonly admission?: Admission; readonly signal?: AbortSignal }

/** Include only live descriptors that the existing tool gate can expose. */
export async function mcpToolsForRun(request: McpRunInput, operation?: {
  readonly reached?: readonly string[]; readonly admission?: Admission; readonly signal?: AbortSignal;
}): Promise<{
    readonly tools: readonly McpToolDescriptor[];
    readonly gateway: McpInvoker | undefined;
    readonly complete: boolean;
  } | undefined> {
  const gateway = request.mcpGateway;
  if (!gateway) return undefined;
  const captured = request.catalogContent && (request.catalogContent.mcpTools ?? []);
  const filter = mcpCatalogFilter(request.runtimeConfig, request.forcedTool, captured, operation?.reached);
  if (filter === false) return undefined;
  const signal = operation?.signal ?? request.signal;
  try {
    const snapshot = await gateway.snapshot(operation?.admission ?? request.admission, signal, filter);
    const unavailable = snapshot.clients.flatMap(client => {
      return client.type === 'connected' ? [] : [`${client.name} (${client.type}). ${describeMcpConnectionState(client).doNext}`];
    });
    if (unavailable.length) createComponentLogger('mcp').warn(`MCP tools unavailable this run. ${unavailable.join(' ')}`);
    const tools = captured ? snapshot.tools.filter(tool => captured.some(saved => sameValue(saved, tool))) : snapshot.tools;
    return { tools, complete: unavailable.length === 0, gateway: gateway.invokeTool ? {
      invokeTool: (server, tool, args, admission, options) => gateway.invokeTool!(server, tool, args,
        combineAdmission(request.admission, admission), options),
    } : undefined };
  } catch (error) {
    signal?.throwIfAborted();
    const details = error instanceof McpGatewayBlockedError ? ` ${error.mcpSafeDetail} ${error.doNext}` : '';
    createComponentLogger('mcp').warn(`MCP tool discovery failed.${details}`);
    return undefined;
  }
}

function combineAdmission(run?: Admission, tool?: Admission): Admission | undefined {
  return run && tool && run !== tool ? () => run() ?? tool() : run ?? tool;
}

export function mcpToolDefinitions(tools: readonly McpToolDescriptor[], gateway?: McpInvoker): ToolDefinition[] {
  return tools.map(tool => ({
    name: tool.qualifiedName,
    description: `[MCP:${tool.serverName}] ${tool.description}`,
    argsSchema: tool.inputSchema ?? { type: 'object' },
    mcpAnnotations: { readOnlyHint: tool.annotations?.readOnlyHint === true },
    async execute(args, context) {
      if (!gateway) return deniedResult(`The MCP gateway is not connected, so ${tool.qualifiedName} cannot be called. Report this to the user.`);
      try {
        const answer = await gateway.invokeTool(tool.serverName, tool.toolName, args, context.admission,
          { signal: context.abortSignal, contractId: tool.contractId });
        return answer.isError
          ? deniedResult(`${tool.qualifiedName} failed on server "${tool.serverName}": ${answer.content}`)
          : approvedResult(answer.content);
      } catch (error) {
        const failure = error instanceof McpGatewayBlockedError
          ? classifyMcpFailure({ failureClass: error.mcpFailureClass, detail: error.mcpSafeDetail })
          : classifyUnknownMcpFailure(error);
        return runtimeErrorResult(`[MCP ${failure.failureClass}; ${failure.failurePlane}] ${failure.safeDetail}`, mcpFailureMetadata(failure));
      }
    },
  }));
}

/** Only a discovery action can add validated MCP definitions to its own run. */
export function deferredMcpTools(request: McpRunInput, catalog: Map<string, ToolDefinition>) {
  let complete = false;
  let bytes = 0;
  let count = 0;
  return async (names: readonly string[] | undefined, context: ToolExecutionContext): Promise<boolean> => {
    const admission = combineAdmission(request.admission, context.admission);
    const signal = request.signal && context.abortSignal && request.signal !== context.abortSignal
      ? AbortSignal.any([request.signal, context.abortSignal]) : request.signal ?? context.abortSignal;
    signal?.throwIfAborted();
    assertAdmission(admission);
    const candidates = names?.map(name => name.trim());
    const reached = candidates?.includes('codemode') && catalog.has('codemode')
      ? undefined : candidates?.filter(name => !catalog.has(name));
    const config = request.runtimeConfig;
    if (complete || mcpCatalogFilter(config, request.forcedTool, undefined, reached) === false) return true;
    const resolved = await mcpToolsForRun(request, { reached, admission, signal });
    signal?.throwIfAborted();
    assertAdmission(admission);
    if (!resolved) return false;
    const discovered = resolved.tools.filter(tool => tool.qualifiedName === mcpServerToolPrefix(tool.serverName) + tool.toolName
      && (!reached || reached.includes(tool.qualifiedName)) && !catalog.has(tool.qualifiedName));
    const visible = new Set(filterVisibleToolNames(discovered.map(tool => tool.qualifiedName), config!));
    const candidatesByName = new Map<string, McpToolDescriptor>();
    for (const tool of discovered) {
      if (!visible.delete(tool.qualifiedName)) { candidatesByName.delete(tool.qualifiedName); continue; }
      candidatesByName.set(tool.qualifiedName, tool);
    }
    const additions = [...candidatesByName.values()];
    const nextBytes = bytes + (additions.length ? Buffer.byteLength(JSON.stringify(additions)) : 0);
    if (nextBytes > MCP_CATALOG_BYTES) throw new McpCatalogLimitError('bytes');
    if (count + additions.length > MCP_CATALOG_TOOLS) throw new McpCatalogLimitError('tools');
    for (const tool of mcpToolDefinitions(additions, resolved.gateway)) catalog.set(tool.name, tool);
    bytes = nextBytes;
    count += additions.length;
    complete ||= reached === undefined && resolved.complete;
    return resolved.complete;
  };
}
