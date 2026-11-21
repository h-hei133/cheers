import {
  isMcpConfigLoadError,
  loadMcpConfigs,
} from "./config.js";
import { CoreMcpConnectionManager } from "./connectionManager.js";
import { McpBackgroundDiscovery, type AvailableMcpSnapshot } from './background.js';
import { projectTrust } from "../security/projectTrust.js";
import { assertAdmission, type Admission } from '../network/admission.js';
import type { McpContentRequest, McpContentResponse, McpNotificationSnapshot } from "./content/types.js";
import { McpContentLifetime } from "./content/lifetime.js";
import { mcpSelectionAdmission, selectMcpServers } from './config/selection.js';
import type { McpHttpAuthorization } from './http/fetch.js';
import type {
  McpClientSnapshot,
  McpConnectionState,
  McpServerFilter,
  McpToolCallResult,
  McpToolInvocation,
  ScopedMcpServerConfig,
} from "./types.js";
import {
  classifyMcpFailure,
} from "./errorTaxonomy.js";
import {
  MCP_CATALOG_BYTES,
  MCP_CATALOG_TIMEOUT_MS,
  MCP_CATALOG_TOOLS,
  McpCatalogLimitError,
} from './catalogLimit.js';

export { describeMcpConnectionState, McpGatewayBlockedError, type McpGatewayBlockerKind } from "./status.js";
import { McpGatewayBlockedError, unavailableServer, unknownServer } from "./status.js";

export interface McpDefinitionSource {
  read(workspaceRoot: string): Record<string, ScopedMcpServerConfig>;
  subscribe(changed: () => void, workspaceRoot: () => string): () => void;
}

export class CoreMcpGateway {
  private workspaceRoot: string;
  private readonly connectionManager: CoreMcpConnectionManager;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly pending = new Set<() => void>();
  private closed = false;
  private closing?: Promise<void>;
  private readonly contentLifetime = new McpContentLifetime();
  private readonly background: McpBackgroundDiscovery;
  private readonly unsubscribeDefinitions?: () => void;

  constructor(private readonly root: string | (() => string), private readonly admissionForOperation?: () => Admission,
    authorizationFor?: (name: string, config: ScopedMcpServerConfig) => McpHttpAuthorization | undefined,
    private readonly snapshotTimeoutMs = MCP_CATALOG_TIMEOUT_MS, private readonly definitions?: McpDefinitionSource) {
    this.workspaceRoot = typeof root === "string" ? root : root();
    this.connectionManager = new CoreMcpConnectionManager(authorizationFor,
      (name, config, workspaceRoot) => this.connectionAdmission(name, config, workspaceRoot));
    this.background = new McpBackgroundDiscovery(this.connectionManager, this.snapshotTimeoutMs);
    this.unsubscribeDefinitions = definitions?.subscribe(() => {
      if (!this.closed) void this.configurationChanged().catch(() => {});
    }, () => this.workspaceRoot);
  }

  subscribe(changed: () => void): () => void {
    return this.connectionManager.subscribe(changed);
  }

  loadConfigs(): Record<string, ScopedMcpServerConfig> {
    const trusted = !projectTrust.isProjectUntrusted(this.workspaceRoot);
    const configs = loadMcpConfigs(this.workspaceRoot, trusted);
    if (trusted && this.definitions) {
      for (const [name, config] of Object.entries(this.definitions.read(this.workspaceRoot))) {
        if (!Object.hasOwn(configs, name)) configs[name] = config;
      }
    }
    return configs;
  }

  snapshot(admission = this.admissionForOperation?.(), signal?: AbortSignal, filter?: McpServerFilter): Promise<McpClientSnapshot> {
    return this.run(async () => {
      signal?.throwIfAborted();
      assertAdmission(admission);
      const configs = await this.prepare(admission);
      signal?.throwIfAborted();
      return this.readSnapshot(selectMcpServers(configs, filter), admission, signal);
    }, signal);
  }

  /** Start discovery without making broad tool searches wait for transport I/O. */
  availableSnapshot(admission = this.admissionForOperation?.(), signal?: AbortSignal, filter?: McpServerFilter): Promise<AvailableMcpSnapshot> {
    return this.run(async () => {
      await this.prepare(admission);
      const root = this.workspaceRoot;
      return this.background.discover({ root, admission, signal, current: () => {
        const currentRoot = typeof this.root === 'string' ? this.root : this.root();
        if (this.closed || root !== this.workspaceRoot || root !== currentRoot) throw new Error('MCP workspace changed during discovery.');
        return this.loadConfigs();
      } }, filter);
    }, signal);
  }

  /** Read existing catalogs only; workspace reconciliation belongs to explicit operations. */
  peekSnapshot(filter?: McpServerFilter): McpClientSnapshot | undefined {
    const currentRoot = typeof this.root === "string" ? this.root : this.root();
    if (this.closed || currentRoot !== this.workspaceRoot) return undefined;
    return this.connectionManager.peekSnapshot(selectMcpServers(this.loadConfigs(), filter));
  }

  refresh(target: string = "all", options?: { exactTarget: boolean; signal?: AbortSignal;
    expectedConfig?: ScopedMcpServerConfig; admission?: () => string | undefined }): Promise<McpClientSnapshot> {
    const name = target.trim();
    const all = !options?.exactTarget && !options?.expectedConfig && (!name || name.toLowerCase() === 'all');
    const admission = mcpSelectionAdmission(this.loadConfigs.bind(this), name, options?.expectedConfig,
      options?.admission ?? this.admissionForOperation?.(), options?.signal);
    return this.run(async () => {
      assertAdmission(admission);
      const configs = await this.prepare(admission);
      assertAdmission(admission);
      if (!all && !Object.hasOwn(configs, name)) {
        throw unknownServer(name);
      }
      try {
        await this.connectionManager.close(all ? undefined : name);
        assertAdmission(admission);
        return await this.readSnapshot(all ? configs : { [name]: configs[name]! }, admission, options?.signal);
      } catch (error) {
        // A rejected or cancelled refresh must not retain its newly opened transport.
        await this.connectionManager.close(all ? undefined : name);
        throw error;
      }
    }, options?.signal);
  }

  /** Revocation begins before queued work settles; config publication never starts discovery. */
  async configurationChanged(target?: string): Promise<void> {
    this.background.cancel();
    // Close only changed owners immediately, including a request holding the lane.
    // The normal admission fence rejects its late result without replay.
    try { if (target) await this.connectionManager.close(target); await this.connectionManager.reconcile(this.loadConfigs()); }
    catch (error) { await this.connectionManager.close(); throw error; }
    await this.run(async () => { await this.prepare(); });
  }

  invokeTool(serverName: string, toolName: string, args: Record<string, unknown>, admission = this.admissionForOperation?.(), options?: McpToolInvocation): Promise<McpToolCallResult> {
    return this.run(async () => {
      options?.signal?.throwIfAborted();
      assertAdmission(admission);
      const configs = await this.prepare(admission);
      const config = Object.hasOwn(configs, serverName) ? configs[serverName] : undefined;
      if (!config) throw unknownServer(serverName);
      const root = this.workspaceRoot;
      const current = this.connectionAdmission(serverName, config, root);
      const authorized: Admission = () => {
        assertAdmission(admission);
        if (current()) {
          throw new McpGatewayBlockedError({ message: 'MCP source or workspace changed before tool dispatch.',
            blockerKind: 'unknown', mcpFailureClass: 'tool-unavailable', doNext: 'Refresh tools and obtain a new approval.' });
        }
        return undefined;
      };
      return this.connectionManager.withToolDiscovery(serverName, async () => {
        options?.signal?.throwIfAborted();
        assertAdmission(authorized);
        const client = this.connectionManager.get(serverName, config, root);
        const state = await client.connect(authorized, options?.signal);
        if (state.type !== "connected") throw unavailableServer(state);
        assertAdmission(authorized);
        const liveTools = await client.listTools(authorized, options?.signal);
        if (!liveTools.some(tool => tool.toolName === toolName && (options?.contractId === undefined || tool.contractId === options.contractId))) {
          throw new McpGatewayBlockedError({
            message: "MCP tool " + toolName + " is unavailable or its definition/connection changed on server " + serverName,
            blockerKind: "unknown", mcpFailureClass: "tool-unavailable",
            doNext: "Run /mcp refresh " + serverName + " and retry with a visible MCP tool.",
          });
        }
        assertAdmission(authorized);
        return client.invokeTool(toolName, args, authorized, options);
      }, options?.signal);
    }, options?.signal);
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
    if (this.closing) return this.closing;
    this.closed = true;
    this.unsubscribeDefinitions?.();
    for (const cancel of this.pending) cancel();
    this.contentLifetime.cancel();
    return this.closing = Promise.all([this.background.close(), this.connectionManager.shutdown(), this.queue]).then(() => {});
  }

  private run<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (this.closed) return Promise.reject(new Error("MCP gateway is closed"));
    if (signal?.aborted) return Promise.reject(signal.reason);
    return new Promise<T>((resolve, reject) => {
      const abort = (): void => {
        finish();
        reject(signal?.aborted ? signal.reason : new Error("MCP gateway is closed"));
      };
      const finish = (): void => {
        this.pending.delete(abort);
        signal?.removeEventListener("abort", abort);
      };
      this.pending.add(abort);
      const queued = this.queue.then(() => {
        // Once active, the operation owns cancellation and its outcome.
        finish();
        if (this.closed) throw new Error("MCP gateway is closed");
        signal?.throwIfAborted();
        return operation();
      });
      this.queue = queued.catch(() => {});
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      queued.then(
        value => { finish(); resolve(value); },
        error => { finish(); reject(error); },
      );
    });
  }

  private async synchronizeWorkspace(): Promise<void> {
    const next = typeof this.root === "string" ? this.root : this.root();
    if (next === this.workspaceRoot) return;
    this.background.cancel();
    await this.connectionManager.close();
    this.workspaceRoot = next;
  }

  private connectionAdmission(name: string, config: ScopedMcpServerConfig, root: string): Admission {
    const expected = JSON.stringify(config);
    return () => {
      const current = typeof this.root === 'string' ? this.root : this.root();
      if (this.closed || current !== root || this.workspaceRoot !== root || JSON.stringify(this.loadConfigs()[name]) !== expected) {
        return 'MCP workspace or server definition changed during the request.';
      }
      return this.admissionForOperation?.()();
    };
  }

  private async prepare(admission?: Admission): Promise<Record<string, ScopedMcpServerConfig>> {
    await this.synchronizeWorkspace();
    assertAdmission(admission);
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
    assertAdmission(admission);
    await this.connectionManager.reconcile(configs);
    return configs;
  }

  private async readSnapshot(configs: Record<string, ScopedMcpServerConfig>, admission?: Admission, signal?: AbortSignal): Promise<McpClientSnapshot> {
    const clients: McpConnectionState[] = [];
    const tools: McpClientSnapshot["tools"] = [];
    const deadline = Date.now() + this.snapshotTimeoutMs;
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(new McpCatalogLimitError('deadline')), Math.max(0, deadline - Date.now()));
    const lifecycle = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
    let bytes = 0;
    try {
      for (const [name, config] of Object.entries(configs)) {
        await this.connectionManager.withToolDiscovery(name, async () => {
          lifecycle.throwIfAborted();
          assertAdmission(admission);
          const client = this.connectionManager.get(name, config, this.workspaceRoot);
          let state = await client.connect(admission, lifecycle);
          if (state.type === "connected") {
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
              await this.connectionManager.close(name);
              state = { type: "failed", name, config, error: classifyMcpFailure({
                failureClass: "protocol",
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
      if (limit) {
        let cleanupUnconfirmed = false;
        try { await this.connectionManager.close(new Set(Object.keys(configs))); }
        catch { cleanupUnconfirmed = true; }
        throw new McpGatewayBlockedError({
          message: limit.message + (cleanupUnconfirmed ? '; MCP connection cleanup could not be confirmed.' : ''),
          blockerKind: 'environment-not-ready',
          mcpFailureClass: limit.failureClass,
          doNext: limit.kind === 'deadline'
            ? 'Run /mcp refresh all after slow or unavailable servers respond, or reduce the configured server set.'
            : 'Reduce configured MCP servers or exposed tools, then run /mcp refresh all.',
        });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

}
