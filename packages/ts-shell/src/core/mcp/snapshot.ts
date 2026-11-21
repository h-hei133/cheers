import { assertAdmission, type Admission } from '../network/admission.js';
import { MCP_CATALOG_BYTES, MCP_CATALOG_TOOLS, McpCatalogLimitError } from './catalogLimit.js';
import type { CoreMcpConnectionManager } from './connectionManager.js';
import { classifyMcpFailure } from './errorTaxonomy.js';
import { McpGatewayBlockedError } from './status.js';
import type { McpClientSnapshot, McpConnectionState, ScopedMcpServerConfig } from './types.js';

export async function readMcpSnapshot(
  connections: CoreMcpConnectionManager,
  configs: Record<string, ScopedMcpServerConfig>,
  { workspaceRoot, timeoutMs, admission, signal }: {
    workspaceRoot: string;
    timeoutMs: number;
    admission?: Admission;
    signal?: AbortSignal;
  },
): Promise<McpClientSnapshot> {
  const clients: McpConnectionState[] = [];
  const tools: McpClientSnapshot['tools'] = [];
  const deadline = Date.now() + timeoutMs;
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(new McpCatalogLimitError('deadline')), Math.max(0, deadline - Date.now()));
  const lifecycle = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
  let bytes = 0;
  try {
    for (const [name, config] of Object.entries(configs)) {
      await connections.withToolDiscovery(name, async () => {
        lifecycle.throwIfAborted();
        assertAdmission(admission);
        const client = connections.get(name, config, workspaceRoot);
        let state = await client.connect(admission, lifecycle);
        if (state.type === 'connected') {
          lifecycle.throwIfAborted();
          assertAdmission(admission);
          try {
            const listed = await client.listTools(admission, lifecycle, { deadline });
            const listedBytes = Buffer.byteLength(JSON.stringify(listed), 'utf8');
            if (bytes + listedBytes > MCP_CATALOG_BYTES) throw new McpCatalogLimitError('bytes');
            if (tools.length + listed.length > MCP_CATALOG_TOOLS) throw new McpCatalogLimitError('tools');
            bytes += listedBytes;
            tools.push(...listed);
          } catch (error) {
            if (error instanceof McpCatalogLimitError || lifecycle.aborted) throw error;
            await connections.close(name);
            state = { type: 'failed', name, config, error: classifyMcpFailure({
              failureClass: 'protocol',
              detail: error instanceof Error ? error.message : String(error),
            }).safeDetail };
          }
        }
        clients.push(state);
      }, lifecycle);
    }
    lifecycle.throwIfAborted();
    assertAdmission(admission);
    return { clients, tools };
  } catch (error) {
    const limit = error instanceof McpCatalogLimitError ? error
      : timeout.signal.aborted && timeout.signal.reason instanceof McpCatalogLimitError
        ? timeout.signal.reason
        : undefined;
    if (!limit) throw error;

    let cleanupUnconfirmed = false;
    try { await connections.close(new Set(Object.keys(configs))); }
    catch { cleanupUnconfirmed = true; }
    throw new McpGatewayBlockedError({
      message: limit.message + (cleanupUnconfirmed ? '; MCP connection cleanup could not be confirmed.' : ''),
      blockerKind: 'environment-not-ready',
      mcpFailureClass: limit.failureClass,
      doNext: limit.kind === 'deadline'
        ? 'Run /mcp refresh all after slow or unavailable servers respond, or reduce the configured server set.'
        : 'Reduce configured MCP servers or exposed tools, then run /mcp refresh all.',
    });
  } finally {
    clearTimeout(timer);
  }
}
