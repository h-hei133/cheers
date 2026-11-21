import { CoreMcpClient } from "./client.js";
import { createStateChanges } from "../state/changes.js";
import type { McpClientSnapshot, ScopedMcpServerConfig } from "./types.js";
import type { McpNotificationSnapshot } from "./content/types.js";
import type { McpHttpAuthorization } from './http/fetch.js';
import { MCP_CATALOG_BYTES, MCP_CATALOG_TOOLS } from './catalogLimit.js';
import type { Admission } from '../network/admission.js';

/** Owns live connections and serializes catalog work per server. */
export class CoreMcpConnectionManager {
  private closed = false;
  private readonly clients = new Map<string, CoreMcpClient>();
  private readonly toolQueues = new Map<string, Promise<void>>();
  private readonly changes = createStateChanges();

  constructor(private readonly authorizationFor?: (name: string, config: ScopedMcpServerConfig) => McpHttpAuthorization | undefined,
    private readonly admissionFor?: (name: string, config: ScopedMcpServerConfig, workspaceRoot: string) => Admission) {}

  subscribe(changed: () => void): () => void {
    return this.changes.subscribe("catalog", changed);
  }

  peekSnapshot(configs: Record<string, ScopedMcpServerConfig>): McpClientSnapshot | undefined {
    if (this.closed) return undefined;
    const snapshot = this.peekReadySnapshot(configs);
    return snapshot.clients.length === Object.keys(configs).length ? snapshot : undefined;
  }

  hasReadyTools(name: string, config: ScopedMcpServerConfig): boolean {
    const client = this.clients.get(name);
    return client?.toolsReady === true && JSON.stringify(client.config) === JSON.stringify(config);
  }

  peekReadySnapshot(configs: Record<string, ScopedMcpServerConfig>): McpClientSnapshot {
    const snapshot: McpClientSnapshot = { clients: [], tools: [] };
    let bytes = 0;
    for (const [name, config] of Object.entries(configs)) {
      const client = this.clients.get(name);
      if (!client || JSON.stringify(client.config) !== JSON.stringify(config)) continue;
      const tools = client.peekTools();
      if (!tools) continue;
      const listedBytes = Buffer.byteLength(JSON.stringify(tools), 'utf8');
      if (bytes + listedBytes > MCP_CATALOG_BYTES || snapshot.tools.length + tools.length > MCP_CATALOG_TOOLS) break;
      bytes += listedBytes;
      snapshot.clients.push({ type: "connected", name, config: structuredClone(config) });
      snapshot.tools.push(...tools);
    }
    return snapshot;
  }

  withToolDiscovery<T>(name: string, operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    const previous = this.toolQueues.get(name) ?? Promise.resolve();
    let stopWaiting: (() => void) | undefined;
    const current = previous.then(() => {
      stopWaiting?.();
      signal?.throwIfAborted();
      return operation();
    });
    const settled = current.then(() => {}, () => {});
    this.toolQueues.set(name, settled);
    const result = current.finally(() => {
      if (this.toolQueues.get(name) === settled) this.toolQueues.delete(name);
    });
    if (!signal) return result;
    return new Promise((resolve, reject) => {
      const abort = (): void => reject(signal.reason);
      stopWaiting = () => signal.removeEventListener('abort', abort);
      signal.addEventListener('abort', abort, { once: true });
      result.then(resolve, reject);
    });
  }

  async reconcile(configs: Record<string, ScopedMcpServerConfig>): Promise<void> {
    for (const [name, client] of this.clients) {
      if (!configs[name] || JSON.stringify(configs[name]) !== JSON.stringify(client.config)) {
        await this.close(name);
      }
    }
  }

  notifications(configs: Record<string, ScopedMcpServerConfig>): McpNotificationSnapshot[] {
    return Object.entries(configs).map(([name, config]) => {
      const client = this.clients.get(name);
      if (!this.closed && client && JSON.stringify(client.config) === JSON.stringify(config)) return client.notifications();
      return { serverName: name, state: "not-connected", entries: [], dropped: 0 };
    });
  }

  get(name: string, config: ScopedMcpServerConfig, workspaceRoot: string): CoreMcpClient {
    if (this.closed) throw new Error("MCP connection manager is closed");
    let client = this.clients.get(name);
    if (client && JSON.stringify(client.config) !== JSON.stringify(config)) throw new Error('MCP server definition changed.');
    if (!client) {
      client = new CoreMcpClient(name, config, workspaceRoot, undefined, () => this.changes.notify("catalog"),
        config.extensionOwner === undefined ? this.authorizationFor?.(name, config) : undefined,
        this.admissionFor?.(name, config, workspaceRoot));
      this.clients.set(name, client);
    }
    return client;
  }

  shutdown(): Promise<void> {
    this.closed = true;
    return this.close();
  }

  async close(target?: string | ReadonlySet<string>): Promise<void> {
    const entries = [...this.clients].filter(([key]) => target === undefined || (typeof target === 'string' ? key === target : target.has(key)));
    const results = await Promise.allSettled(entries.map(([, client]) => this.closeOwned(client)));
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length) throw new AggregateError(failures.map(result => result.reason), "MCP connection cleanup failed");
  }

  async closeOwned(client: CoreMcpClient): Promise<void> {
    await client.close();
    if (this.clients.get(client.name) === client) this.clients.delete(client.name);
  }
}
