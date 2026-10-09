import {
  isMcpConfigLoadError,
  loadMcpConfigs,
} from "./config.js";
import { CoreMcpConnectionManager } from "./connectionManager.js";
import { projectTrust } from "../security/projectTrust.js";
import { assertAdmission, type Admission } from '../network/admission.js';
import type { McpContentRequest, McpContentResponse, McpNotificationSnapshot } from "./content/types.js";
import { McpContentLifetime } from "./content/lifetime.js";
import type {
  McpClientSnapshot,
  McpConnectionState,
  McpToolCallResult,
  ScopedMcpServerConfig,
} from "./types.js";
import {
  classifyMcpFailure,
} from "./errorTaxonomy.js";

export { describeMcpConnectionState, McpGatewayBlockedError, type McpGatewayBlockerKind } from "./status.js";
import { describeMcpConnectionState, McpGatewayBlockedError, unknownServer, failureClassForConnectionState } from "./status.js";

export class CoreMcpGateway {
  private workspaceRoot: string;
  private readonly connectionManager = new CoreMcpConnectionManager();
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;
  private closing?: Promise<void>;
  private readonly contentLifetime = new McpContentLifetime();

  constructor(private readonly root: string | (() => string), private readonly admissionForOperation?: () => Admission) {
    this.workspaceRoot = typeof root === "string" ? root : root();
  }

  subscribe(changed: () => void): () => void {
    return this.connectionManager.subscribe(changed);
  }

  loadConfigs(): Record<string, ScopedMcpServerConfig> {
    return loadMcpConfigs(this.workspaceRoot, !projectTrust.isProjectUntrusted(this.workspaceRoot));
  }

  snapshot(admission = this.admissionForOperation?.()): Promise<McpClientSnapshot> {
    return this.run(async () => { assertAdmission(admission); return this.readSnapshot(await this.prepare(), admission); });
  }

  /** Read existing catalogs only; workspace reconciliation belongs to explicit operations. */
  peekSnapshot(): McpClientSnapshot | undefined {
    const currentRoot = typeof this.root === "string" ? this.root : this.root();
    if (this.closed || currentRoot !== this.workspaceRoot) return undefined;
    return this.connectionManager.peekSnapshot(this.loadConfigs());
  }

  refresh(target: string = "all", options?: { exactTarget: boolean }): Promise<McpClientSnapshot> {
    const admission = this.admissionForOperation?.();
    return this.run(async () => {
      assertAdmission(admission);
      const configs = await this.prepare();
      const name = target.trim();
      const all = !options?.exactTarget && (!name || name.toLowerCase() === "all");
      if (!all && !Object.hasOwn(configs, name)) {
        throw unknownServer(name);
      }
      await this.connectionManager.close(all ? undefined : name);
      return this.readSnapshot(all ? configs : { [name]: configs[name]! }, admission);
    });
  }

  /** Revocation begins before queued work settles; config publication never starts discovery. */
  async configurationChanged(): Promise<void> {
    // Close only changed owners immediately, including a request holding the lane.
    // The normal admission fence rejects its late result without replay.
    try { await this.connectionManager.reconcile(this.loadConfigs()); }
    catch (error) { await this.connectionManager.close(); throw error; }
    await this.run(async () => { await this.prepare(); });
  }

  invokeTool(serverName: string, toolName: string, args: Record<string, unknown>, admission = this.admissionForOperation?.()): Promise<McpToolCallResult> {
    return this.run(async () => {
      assertAdmission(admission);
      const configs = await this.prepare();
      const config = configs[serverName];
      if (!config) throw unknownServer(serverName);
      assertAdmission(admission);
      const client = this.connectionManager.get(serverName, config, this.workspaceRoot);
      const state = await client.connect(admission);
      if (state.type !== "connected") throw this.createUnavailableServerBlockedError(state);
      assertAdmission(admission);
      const liveTools = await client.listTools(admission);
      if (!liveTools.some(tool => tool.toolName === toolName)) {
        throw new McpGatewayBlockedError({
          message: "MCP tool " + toolName + " is unavailable on server " + serverName,
          blockerKind: "unknown", mcpFailureClass: "tool-unavailable",
          doNext: "Run /mcp refresh " + serverName + " and retry with a visible MCP tool.",
        });
      }
      assertAdmission(admission);
      return client.invokeTool(toolName, args, admission);
    });
  }

  content(serverName: string, request: McpContentRequest, signal?: AbortSignal): Promise<McpContentResponse> {
    const admission = this.admissionForOperation?.();
    const root = typeof this.root === "string" ? this.root : this.root();
    const lifetime = this.contentLifetime.begin(signal);
    return this.run(async () => {
      lifetime.signal.throwIfAborted();
      assertAdmission(admission);
      const configs = await this.prepare();
      const config = Object.hasOwn(configs, serverName) ? configs[serverName] : undefined;
      if (!config) throw unknownServer(serverName);
      const current = () => {
        assertAdmission(admission);
        if (root !== this.workspaceRoot || root !== (typeof this.root === "string" ? this.root : this.root())) return "MCP workspace changed during request";
        if (JSON.stringify(this.loadConfigs()[serverName]) !== JSON.stringify(config)) return "MCP configuration changed during request";
        return undefined;
      };
      try {
        const result = await this.connectionManager.get(serverName, config, root).content(request, current, lifetime.signal);
        assertAdmission(current);
        return { serverName, scope: config.scope, transport: config.transport, result };
      } catch (error) {
        // Preserve a healthy connection and subscriptions on ordinary request rejection.
        // Cancellation and invalid authority must also revoke the physical connection.
        let invalid = lifetime.signal.aborted;
        try { invalid ||= current() !== undefined; } catch { invalid = true; }
        if (invalid) await this.connectionManager.close(serverName);
        throw error;
      }
    }).finally(lifetime.dispose);
  }

  cancelContent(): void {
    this.contentLifetime.cancel();
  }

  /** Inspect only the current connection's bounded metadata; no discovery or authentication. */
  notifications(target?: string): McpNotificationSnapshot[] {
    if (this.closed) throw new Error("MCP gateway is closed");
    const configs = this.loadConfigs();
    if (target && !Object.hasOwn(configs, target)) throw unknownServer(target);
    const root = typeof this.root === "string" ? this.root : this.root();
    return this.connectionManager.notifications(root === this.workspaceRoot ? configs : {}).filter(item => !target || item.serverName === target);
  }

  /** Called after a shell root transition, also checked on every request. */
  syncWorkspace(): Promise<void> {
    return this.run(() => this.synchronizeWorkspace());
  }

  close(): Promise<void> {
    this.closed = true;
    this.contentLifetime.cancel();
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

  private async readSnapshot(configs: Record<string, ScopedMcpServerConfig>, admission?: Admission): Promise<McpClientSnapshot> {
    const clients: McpConnectionState[] = [];
    const tools: McpClientSnapshot["tools"] = [];
    for (const [name, config] of Object.entries(configs)) {
      assertAdmission(admission);
      const client = this.connectionManager.get(name, config, this.workspaceRoot);
      let state = await client.connect(admission);
      if (state.type === "connected") {
        assertAdmission(admission);
        try {
          tools.push(...await client.listTools(admission));
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
    assertAdmission(admission);
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
