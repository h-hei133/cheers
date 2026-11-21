import {
  isMcpConfigLoadError,
  loadMcpConfigs,
} from "./config.js";
import { CoreMcpConnectionManager } from "./connectionManager.js";
import { McpBackgroundDiscovery, type AvailableMcpSnapshot } from './background.js';
import { McpOperationQueue } from './queue.js';
import { projectTrust } from "../security/projectTrust.js";
import { assertAdmission, type Admission } from '../network/admission.js';
import type { McpContentRequest, McpContentResponse, McpNotificationSnapshot } from "./content/types.js";
import { McpContentLifetime } from "./content/lifetime.js";
import { mcpSelectionAdmission, selectMcpServers } from './config/selection.js';
import type { McpHttpAuthorization } from './http/fetch.js';
import { readMcpSnapshot } from './snapshot.js';
import type {
  McpClientSnapshot,
  McpServerFilter,
  McpToolCallResult,
  McpToolInvocation,
  ScopedMcpServerConfig,
} from "./types.js";
import { MCP_CATALOG_TIMEOUT_MS } from './catalogLimit.js';

export { describeMcpConnectionState, McpGatewayBlockedError, type McpGatewayBlockerKind } from "./status.js";
import { McpGatewayBlockedError, unavailableServer, unknownServer } from "./status.js";

export interface McpDefinitionSource {
  read(workspaceRoot: string): Record<string, ScopedMcpServerConfig>;
  subscribe(changed: () => void, workspaceRoot: () => string): () => void;
}

export type McpGateway = Omit<CoreMcpGateway, 'admissionForOperation' | 'content' | 'loadConfigs'> & {
  readonly content: (server: string, request: McpContentRequest, signal?: AbortSignal) => Promise<McpContentResponse>;
  readonly loadConfigs: () => Record<string, ScopedMcpServerConfig>;
};

export class CoreMcpGateway {
  private workspaceRoot: string;
  private readonly connectionManager: CoreMcpConnectionManager;
  private readonly operations = new McpOperationQueue();
  private closing?: Promise<void>;
  private readonly contentLifetime = new McpContentLifetime();
  private readonly background: McpBackgroundDiscovery;
  private readonly unsubscribeDefinitions?: () => void;

  constructor(private readonly root: string | (() => string), readonly admissionForOperation?: () => Admission,
    authorizationFor?: (name: string, config: ScopedMcpServerConfig) => McpHttpAuthorization | undefined,
    private readonly snapshotTimeoutMs = MCP_CATALOG_TIMEOUT_MS, private readonly definitions?: McpDefinitionSource,
    private readonly loadConfigured: typeof loadMcpConfigs = loadMcpConfigs) {
    this.workspaceRoot = typeof root === "string" ? root : root();
    this.connectionManager = new CoreMcpConnectionManager(authorizationFor,
      (name, config, workspaceRoot) => this.connectionAdmission(name, config, workspaceRoot));
    this.background = new McpBackgroundDiscovery(this.connectionManager, this.snapshotTimeoutMs);
    this.unsubscribeDefinitions = definitions?.subscribe(() => {
      if (!this.operations.closed) void this.configurationChanged().catch(() => {});
    }, () => this.workspaceRoot);
  }

  subscribe(changed: () => void): () => void {
    return this.connectionManager.subscribe(changed);
  }

  loadConfigs(source: 'bound' | 'current' = 'bound'): Record<string, ScopedMcpServerConfig> {
    if (source === 'current' && this.operations.closed) throw new Error('MCP gateway is closed');
    const root = source === 'bound' ? this.workspaceRoot : typeof this.root === 'string' ? this.root : this.root();
    const trusted = !projectTrust.isProjectUntrusted(root);
    const configs = this.loadConfigured(root, trusted);
    if (trusted && this.definitions) {
      for (const [name, config] of Object.entries(this.definitions.read(root))) {
        if (!Object.hasOwn(configs, name)) configs[name] = config;
      }
    }
    return configs;
  }

  snapshot(admission = this.admissionForOperation?.(), signal?: AbortSignal, filter?: McpServerFilter): Promise<McpClientSnapshot> {
    return this.operations.run(async () => {
      signal?.throwIfAborted();
      assertAdmission(admission);
      const configs = await this.prepare(admission);
      signal?.throwIfAborted();
      return readMcpSnapshot(this.connectionManager, selectMcpServers(configs, filter), {
        workspaceRoot: this.workspaceRoot, timeoutMs: this.snapshotTimeoutMs, admission, signal,
      });
    }, signal);
  }

  /** Start discovery without making broad tool searches wait for transport I/O. */
  availableSnapshot(admission = this.admissionForOperation?.(), signal?: AbortSignal, filter?: McpServerFilter): Promise<AvailableMcpSnapshot> {
    return this.operations.run(async () => {
      await this.prepare(admission);
      const root = this.workspaceRoot;
      return this.background.discover({ root, admission, signal, current: () => {
        const currentRoot = typeof this.root === 'string' ? this.root : this.root();
        if (this.operations.closed || root !== this.workspaceRoot || root !== currentRoot) throw new Error('MCP workspace changed during discovery.');
        return this.loadConfigs();
      } }, filter);
    }, signal);
  }

  /** Read existing catalogs only; workspace reconciliation belongs to explicit operations. */
  peekSnapshot(filter?: McpServerFilter): McpClientSnapshot | undefined {
    const currentRoot = typeof this.root === "string" ? this.root : this.root();
    if (this.operations.closed || currentRoot !== this.workspaceRoot) return undefined;
    return this.connectionManager.peekSnapshot(selectMcpServers(this.loadConfigs(), filter));
  }

  refresh(target: string = "all", options?: { exactTarget: boolean; signal?: AbortSignal;
    expectedConfig?: ScopedMcpServerConfig; admission?: () => string | undefined }): Promise<McpClientSnapshot> {
    const name = target.trim();
    const all = !options?.exactTarget && !options?.expectedConfig && (!name || name.toLowerCase() === 'all');
    const admission = mcpSelectionAdmission(this.loadConfigs.bind(this), name, options?.expectedConfig,
      options?.admission ?? this.admissionForOperation?.(), options?.signal);
    return this.operations.run(async () => {
      assertAdmission(admission);
      const configs = await this.prepare(admission);
      assertAdmission(admission);
      if (!all && !Object.hasOwn(configs, name)) {
        throw unknownServer(name);
      }
      try {
        await this.connectionManager.close(all ? undefined : name);
        assertAdmission(admission);
        return await readMcpSnapshot(this.connectionManager, all ? configs : { [name]: configs[name]! }, {
          workspaceRoot: this.workspaceRoot, timeoutMs: this.snapshotTimeoutMs, admission, signal: options?.signal,
        });
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
    await this.operations.run(async () => { await this.prepare(); });
  }

  invokeTool(serverName: string, toolName: string, args: Record<string, unknown>, admission = this.admissionForOperation?.(), options?: McpToolInvocation): Promise<McpToolCallResult> {
    return this.operations.run(async () => {
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

  content(serverName: string, request: McpContentRequest, signal?: AbortSignal,
    scope?: { readonly admission: Admission; readonly shared?: true }): Promise<McpContentResponse> {
    const configured = this.admissionForOperation?.();
    const admission = () => configured?.() ?? scope?.admission();
    const root = typeof this.root === "string" ? this.root : this.root();
    const lifetime = this.contentLifetime.begin(scope?.shared ? undefined : signal);
    const scopedRefusal = scope?.shared ? new AbortController() : undefined;
    const requestSignal = scopedRefusal ? AbortSignal.any([lifetime.signal, scopedRefusal.signal, ...(signal ? [signal] : [])]) : lifetime.signal;
    return this.operations.run(async () => {
      requestSignal.throwIfAborted();
      assertAdmission(admission);
      const configs = await this.prepare(admission);
      const config = Object.hasOwn(configs, serverName) ? configs[serverName] : undefined;
      if (!config) throw unknownServer(serverName);
      const connection = () => {
        assertAdmission(configured);
        if (root !== this.workspaceRoot || root !== (typeof this.root === "string" ? this.root : this.root())) return "MCP workspace changed during request";
        if (JSON.stringify(this.loadConfigs()[serverName]) !== JSON.stringify(config)) return "MCP configuration changed during request";
        return undefined;
      };
      const current = () => {
        const refusal = connection();
        if (refusal) return refusal;
        try { assertAdmission(scope?.admission); }
        catch (error) { scopedRefusal?.abort(); throw error; }
        return undefined;
      };
      try {
        const result = await this.connectionManager.get(serverName, config, root).content(request, current, requestSignal);
        requestSignal.throwIfAborted();
        assertAdmission(current);
        return { serverName, scope: config.scope, transport: config.transport, result };
      } catch (error) {
        // The caller-owned connection survives a scoped cancellation. Shared revocation still closes it.
        let invalid = lifetime.signal.aborted;
        try { invalid ||= (scope?.shared ? connection : current)() !== undefined; } catch { invalid = true; }
        if (invalid) await this.connectionManager.close(serverName);
        throw error;
      }
    }, requestSignal).finally(lifetime.dispose);
  }

  cancelContent(): void {
    this.contentLifetime.cancel();
  }

  /** Inspect only the current connection's bounded metadata; no discovery or authentication. */
  notifications(target?: string): McpNotificationSnapshot[] {
    if (this.operations.closed) throw new Error("MCP gateway is closed");
    const configs = this.loadConfigs();
    if (target && !Object.hasOwn(configs, target)) throw unknownServer(target);
    const root = typeof this.root === "string" ? this.root : this.root();
    return this.connectionManager.notifications(root === this.workspaceRoot ? configs : {}).filter(item => !target || item.serverName === target);
  }

  /** Called after a shell root transition, also checked on every request. */
  syncWorkspace(): Promise<void> {
    return this.operations.run(() => this.synchronizeWorkspace());
  }

  close(): Promise<void> {
    if (this.closing) return this.closing;
    const drained = this.operations.close();
    this.unsubscribeDefinitions?.();
    this.contentLifetime.cancel();
    return this.closing = Promise.all([this.background.close(), this.connectionManager.shutdown(), drained]).then(() => {});
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
      if (this.operations.closed || current !== root || this.workspaceRoot !== root || JSON.stringify(this.loadConfigs()[name]) !== expected) {
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

}
