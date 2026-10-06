import { CoreMcpClient } from "./client.js";
import { createStateChanges } from "../state/changes.js";
import type { McpClientSnapshot, ScopedMcpServerConfig } from "./types.js";

/** Owns all live connections; callers serialize config reconciliation and use. */
export class CoreMcpConnectionManager {
  private closed = false;
  private readonly clients = new Map<string, CoreMcpClient>();
  private readonly changes = createStateChanges();

  subscribe(changed: () => void): () => void {
    return this.changes.subscribe("catalog", changed);
  }

  peekSnapshot(configs: Record<string, ScopedMcpServerConfig>): McpClientSnapshot | undefined {
    if (this.closed) return undefined;
    const snapshot: McpClientSnapshot = { clients: [], tools: [] };
    for (const [name, config] of Object.entries(configs)) {
      const client = this.clients.get(name);
      if (!client || JSON.stringify(client.config) !== JSON.stringify(config)) return undefined;
      const tools = client.peekTools();
      if (!tools) return undefined;
      snapshot.clients.push({ type: "connected", name, config: structuredClone(config) });
      snapshot.tools.push(...tools);
    }
    return snapshot;
  }

  async reconcile(configs: Record<string, ScopedMcpServerConfig>): Promise<void> {
    for (const [name, client] of this.clients) {
      if (!configs[name] || JSON.stringify(configs[name]) !== JSON.stringify(client.config)) {
        await this.close(name);
      }
    }
  }

  get(name: string, config: ScopedMcpServerConfig, workspaceRoot: string): CoreMcpClient {
    if (this.closed) throw new Error("MCP connection manager is closed");
    let client = this.clients.get(name);
    if (!client) {
      client = new CoreMcpClient(name, config, workspaceRoot, undefined, () => this.changes.notify("catalog"));
      this.clients.set(name, client);
    }
    return client;
  }

  shutdown(): Promise<void> {
    this.closed = true;
    return this.close();
  }

  async close(name?: string): Promise<void> {
    const entries = name === undefined ? [...this.clients] : [...this.clients].filter(([key]) => key === name);
    const results = await Promise.allSettled(entries.map(async ([key, client]) => {
      await client.close();
      this.clients.delete(key);
    }));
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length) throw new AggregateError(failures.map(result => result.reason), "MCP connection cleanup failed");
  }
}
