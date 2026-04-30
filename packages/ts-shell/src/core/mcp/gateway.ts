import { CoreMcpClient } from "./client.js";
import {
  type McpConfigLoadError,
  isMcpConfigLoadError,
  loadMcpConfigs,
} from "./config.js";
import { CoreMcpConnectionManager } from "./connectionManager.js";
import type {
  McpClientSnapshot,
  McpConnectionState,
  McpToolCallResult,
  ScopedMcpServerConfig,
} from "./types.js";

export type McpGatewayBlockerKind =
  | "command-not-allowlisted"
  | "environment-not-ready"
  | "unknown";

export class McpGatewayBlockedError extends Error {
  readonly blockerKind: McpGatewayBlockerKind;
  readonly doNext: string;

  constructor(input: {
    message: string;
    blockerKind: McpGatewayBlockerKind;
    doNext: string;
  }) {
    super(input.message);
    this.name = "McpGatewayBlockedError";
    this.blockerKind = input.blockerKind;
    this.doNext = input.doNext;
  }
}

export function describeMcpConnectionState(state: McpConnectionState): {
  readonly executable: boolean;
  readonly reason?: string;
  readonly doNext: string;
} {
  if (state.type === "connected") {
    return {
      executable: true,
      doNext: `Run /mcp tools ${state.name} to inspect exposed tools.`,
    };
  }

  const reason = describeUnavailableServer(state);
  if (state.type === "needs-auth") {
    return {
      executable: false,
      reason,
      doNext: `Authenticate server '${state.name}' and rerun /mcp refresh ${state.name}.`,
    };
  }

  if (state.type === "disabled") {
    return {
      executable: false,
      reason,
      doNext: `Enable server '${state.name}' in MCP config, then rerun /mcp refresh ${state.name}.`,
    };
  }

  return {
    executable: false,
    reason,
    doNext: `Run /mcp refresh ${state.name} and verify server connectivity before retrying.`,
  };
}

function describeUnavailableServer(
  state: Exclude<McpConnectionState, { type: "connected" }>,
): string {
  switch (state.type) {
    case "disabled":
      return `MCP server ${state.name} is disabled`;
    case "needs-auth":
      return `MCP server ${state.name} requires authentication`;
    case "failed":
      return `MCP server ${state.name} is unavailable: ${state.error}`;
    case "pending":
      return `MCP server ${state.name} is pending connection`;
  }
}

export class CoreMcpGateway {
  private readonly workspaceRoot: string;
  private readonly connectionManager = new CoreMcpConnectionManager();
  private readonly clientCache = new Map<string, CoreMcpClient>();

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  loadConfigs(): Record<string, ScopedMcpServerConfig> {
    return loadMcpConfigs(this.workspaceRoot);
  }

  async snapshot(): Promise<McpClientSnapshot> {
    const configs = this.loadConfigsOrBlock();
    const clients = await this.connectionManager.connectAll(configs);
    this.pruneClientCache(clients);
    const tools = [];
    const resources: Record<
      string,
      Awaited<ReturnType<CoreMcpClient["listResources"]>>
    > = {};
    const prompts: Record<
      string,
      Awaited<ReturnType<CoreMcpClient["listPrompts"]>>
    > = {};

    for (const clientState of clients) {
      if (clientState.type !== "connected") {
        continue;
      }

      const client = new CoreMcpClient(clientState.name, clientState.config);
      this.clientCache.set(clientState.name, client);
      tools.push(...(await client.listTools()));
      resources[clientState.name] = await client.listResources();
      prompts[clientState.name] = await client.listPrompts();
    }

    return {
      clients,
      tools,
      resources,
      prompts,
    };
  }

  async refresh(target: string = "all"): Promise<McpClientSnapshot> {
    const normalizedTarget = target.trim();
    const configs = this.loadConfigsOrBlock();
    if (
      normalizedTarget &&
      normalizedTarget.toLowerCase() !== "all" &&
      !configs[normalizedTarget]
    ) {
      throw new McpGatewayBlockedError({
        message: `Unknown MCP server: ${normalizedTarget}`,
        blockerKind: "unknown",
        doNext:
          "Run /mcp status to list configured servers, then retry with a valid server name.",
      });
    }

    if (!normalizedTarget || normalizedTarget.toLowerCase() === "all") {
      this.clientCache.clear();
    } else {
      this.clientCache.delete(normalizedTarget);
    }

    return this.snapshot();
  }

  async invokeTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<McpToolCallResult> {
    const configs = this.loadConfigsOrBlock();
    const config = configs[serverName];
    if (!config) {
      this.clientCache.delete(serverName);
      throw new McpGatewayBlockedError({
        message: `Unknown MCP server: ${serverName}`,
        blockerKind: "unknown",
        doNext:
          "Run /mcp status to list configured servers, then retry with a valid server name.",
      });
    }

    const candidate = this.clientCache.get(serverName);
    const client =
      candidate && this.isSameConfig(candidate.config, config)
        ? candidate
        : new CoreMcpClient(serverName, config);

    const connectionState = await client.connect();
    if (connectionState.type !== "connected") {
      this.clientCache.delete(serverName);
      throw this.createUnavailableServerBlockedError(connectionState);
    }

    this.clientCache.set(serverName, client);
    const liveTools = await client.listTools();
    if (!liveTools.some((tool) => tool.toolName === toolName)) {
      throw new McpGatewayBlockedError({
        message: `MCP tool ${toolName} is unavailable on server ${serverName}`,
        blockerKind: "unknown",
        doNext: `Run /mcp refresh ${serverName} and retry with a visible MCP tool.`,
      });
    }

    return client.invokeTool(toolName, args);
  }

  private pruneClientCache(states: readonly McpConnectionState[]): void {
    const connectedServers = new Set(
      states
        .filter(
          (
            state,
          ): state is Extract<McpConnectionState, { type: "connected" }> =>
            state.type === "connected",
        )
        .map((state) => state.name),
    );

    for (const serverName of this.clientCache.keys()) {
      if (!connectedServers.has(serverName)) {
        this.clientCache.delete(serverName);
      }
    }
  }

  private isSameConfig(
    left: ScopedMcpServerConfig,
    right: ScopedMcpServerConfig,
  ): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  private createUnavailableServerBlockedError(
    state: Exclude<McpConnectionState, { type: "connected" }>,
  ): McpGatewayBlockedError {
    const description = describeMcpConnectionState(state);
    return new McpGatewayBlockedError({
      message: description.reason ?? `MCP server ${state.name} is unavailable`,
      blockerKind: "environment-not-ready",
      doNext: description.doNext,
    });
  }

  private loadConfigsOrBlock(): Record<string, ScopedMcpServerConfig> {
    try {
      return this.loadConfigs();
    } catch (error) {
      if (isMcpConfigLoadError(error)) {
        this.clientCache.clear();
        throw this.createConfigBlockedError(error);
      }
      throw error;
    }
  }

  private createConfigBlockedError(error: McpConfigLoadError): McpGatewayBlockedError {
    return new McpGatewayBlockedError({
      message: error.message,
      blockerKind: "environment-not-ready",
      doNext: error.doNext,
    });
  }
}
