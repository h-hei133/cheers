import {
  isMcpConfigLoadError,
  loadMcpConfigs,
} from "./config.js";
import { CoreMcpConnectionManager } from "./connectionManager.js";
import { projectTrust } from "../security/projectTrust.js";
import type {
  McpClientSnapshot,
  McpConnectionState,
  McpToolCallResult,
  ScopedMcpServerConfig,
} from "./types.js";
import {
  classifyMcpFailure,
  type McpFailureClass,
  type McpFailurePlane,
} from "./errorTaxonomy.js";

export type McpGatewayBlockerKind =
  | "command-not-allowlisted"
  | "environment-not-ready"
  | "unknown";

export class McpGatewayBlockedError extends Error {
  readonly blockerKind: McpGatewayBlockerKind;
  readonly doNext: string;
  readonly mcpFailureClass: McpFailureClass;
  readonly mcpFailurePlane: McpFailurePlane;
  readonly mcpSafeDetail: string;

  constructor(input: {
    message: string;
    blockerKind: McpGatewayBlockerKind;
    doNext: string;
    mcpFailureClass?: McpFailureClass;
  }) {
    const taxonomy = classifyMcpFailure({
      failureClass: input.mcpFailureClass ?? "unknown",
      detail: input.message,
    });
    super(taxonomy.safeDetail);
    this.name = "McpGatewayBlockedError";
    this.blockerKind = input.blockerKind;
    this.doNext = input.doNext;
    this.mcpFailureClass = taxonomy.failureClass;
    this.mcpFailurePlane = taxonomy.failurePlane;
    this.mcpSafeDetail = taxonomy.safeDetail;
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
  private workspaceRoot: string;
  private readonly connectionManager = new CoreMcpConnectionManager();
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;
  private closing?: Promise<void>;

  constructor(private readonly root: string | (() => string)) {
    this.workspaceRoot = typeof root === "string" ? root : root();
  }

  loadConfigs(): Record<string, ScopedMcpServerConfig> {
    return loadMcpConfigs(this.workspaceRoot, !projectTrust.isProjectUntrusted(this.workspaceRoot));
  }

  snapshot(): Promise<McpClientSnapshot> {
    return this.run(async () => this.readSnapshot(await this.prepare()));
  }

  refresh(target: string = "all"): Promise<McpClientSnapshot> {
    return this.run(async () => {
      const configs = await this.prepare();
      const name = target.trim();
      if (name && name.toLowerCase() !== "all" && !configs[name]) {
        throw unknownServer(name);
      }
      await this.connectionManager.close(!name || name.toLowerCase() === "all" ? undefined : name);
      return this.readSnapshot(configs);
    });
  }

  invokeTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    return this.run(async () => {
      const configs = await this.prepare();
      const config = configs[serverName];
      if (!config) throw unknownServer(serverName);
      const client = this.connectionManager.get(serverName, config, this.workspaceRoot);
      const state = await client.connect();
      if (state.type !== "connected") throw this.createUnavailableServerBlockedError(state);
      const liveTools = await client.listTools();
      if (!liveTools.some(tool => tool.toolName === toolName)) {
        throw new McpGatewayBlockedError({
          message: "MCP tool " + toolName + " is unavailable on server " + serverName,
          blockerKind: "unknown", mcpFailureClass: "tool-unavailable",
          doNext: "Run /mcp refresh " + serverName + " and retry with a visible MCP tool.",
        });
      }
      return client.invokeTool(toolName, args);
    });
  }

  /** Called after a shell root transition, also checked on every request. */
  syncWorkspace(): Promise<void> {
    return this.run(() => this.synchronizeWorkspace());
  }

  close(): Promise<void> {
    this.closed = true;
    return this.closing ??= Promise.all([this.connectionManager.shutdown(), this.queue]).then(() => {});
  }

  private run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new Error("MCP gateway is closed"));
    const result = this.queue.then(() => {
      if (this.closed) throw new Error("MCP gateway is closed");
      return operation();
    });
    this.queue = result.catch(() => {});
    return result;
  }

  private async synchronizeWorkspace(): Promise<void> {
    const next = typeof this.root === "string" ? this.root : this.root();
    if (next === this.workspaceRoot) return;
    await this.connectionManager.close();
    this.workspaceRoot = next;
  }

  private async prepare(): Promise<Record<string, ScopedMcpServerConfig>> {
    await this.synchronizeWorkspace();
    let configs: Record<string, ScopedMcpServerConfig>;
    try {
      configs = this.loadConfigs();
    } catch (error) {
      await this.connectionManager.close();
      if (!isMcpConfigLoadError(error)) throw error;
      throw new McpGatewayBlockedError({
        message: error.message,
        blockerKind: "environment-not-ready", mcpFailureClass: "config",
        doNext: error.doNext,
      });
    }
    await this.connectionManager.reconcile(configs);
    return configs;
  }

  private async readSnapshot(configs: Record<string, ScopedMcpServerConfig>): Promise<McpClientSnapshot> {
    const clients: McpConnectionState[] = [];
    const tools: McpClientSnapshot["tools"] = [];
    for (const [name, config] of Object.entries(configs)) {
      const client = this.connectionManager.get(name, config, this.workspaceRoot);
      let state = await client.connect();
      if (state.type === "connected") {
        try {
          tools.push(...await client.listTools());
        } catch (error) {
          await this.connectionManager.close(name);
          state = { type: "failed", name, config, error: classifyMcpFailure({
            failureClass: "protocol",
            detail: error instanceof Error ? error.message : String(error),
          }).safeDetail };
        }
      }
      clients.push(state);
    }
    return { clients, tools };
  }

  private createUnavailableServerBlockedError(
    state: Exclude<McpConnectionState, { type: "connected" }>,
  ): McpGatewayBlockedError {
    const description = describeMcpConnectionState(state);
    return new McpGatewayBlockedError({
      message: description.reason ?? "MCP server " + state.name + " is unavailable",
      blockerKind: "environment-not-ready",
      mcpFailureClass: failureClassForConnectionState(state),
      doNext: description.doNext,
    });
  }
}

function unknownServer(name: string): McpGatewayBlockedError {
  return new McpGatewayBlockedError({
    message: "Unknown MCP server: " + name,
    blockerKind: "unknown", mcpFailureClass: "tool-unavailable",
    doNext: "Run /mcp status to list configured servers, then retry with a valid server name.",
  });
}

function failureClassForConnectionState(
  state: Exclude<McpConnectionState, { type: "connected" }>,
): McpFailureClass {
  switch (state.type) {
    case "needs-auth":
      return "permission-denied";
    case "disabled":
      return "config";
    case "failed":
      return state.error.toLowerCase().includes("missing")
        ? "config"
        : "server-unavailable";
    case "pending":
      return "server-unavailable";
  }
}
