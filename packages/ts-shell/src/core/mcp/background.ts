import { createComponentLogger } from '../../observability/structuredLogger.js';
import { assertAdmission, type Admission } from '../network/admission.js';
import { MCP_CATALOG_BYTES, MCP_CATALOG_TOOLS, McpCatalogLimitError } from './catalogLimit.js';
import { selectMcpServers } from './config/selection.js';
import type { CoreMcpConnectionManager } from './connectionManager.js';
import { classifyUnknownMcpFailure } from './errorTaxonomy.js';
import { describeMcpConnectionState } from './status.js';
import type { McpClientSnapshot, McpServerFilter, McpToolDescriptor, ScopedMcpServerConfig } from './types.js';

const DISCOVERY_CONCURRENCY = 4;

export interface AvailableMcpSnapshot {
  readonly snapshot: McpClientSnapshot;
  readonly complete: boolean;
}

interface DiscoveryOwner {
  readonly root: string;
  readonly current: () => Record<string, ScopedMcpServerConfig>;
  readonly admission?: Admission;
  readonly signal?: AbortSignal;
}

/** One cancellable discovery wave per gateway. Foreground calls use their own selection. */
export class McpBackgroundDiscovery {
  private active?: { readonly abort: AbortController; readonly settled: Promise<void> };
  private lastAttempted?: string;

  constructor(private readonly connections: CoreMcpConnectionManager, private readonly timeoutMs: number) {}

  discover(owner: DiscoveryOwner, filter?: McpServerFilter): AvailableMcpSnapshot {
    owner.signal?.throwIfAborted();
    assertAdmission(owner.admission);
    const enabled = Object.entries(selectMcpServers(owner.current(), filter)).filter(([, config]) => config.enabled !== false);
    const snapshot = this.connections.peekReadySnapshot(Object.fromEntries(enabled));
    const ready = new Set(snapshot.clients.map(client => client.name));
    if (!this.active) {
      const start = enabled.findIndex(([name]) => name === this.lastAttempted) + 1;
      const ordered = [...enabled.slice(start), ...enabled.slice(0, start)];
      const missing = ordered.filter(([name, config]) => !ready.has(name) && !this.connections.hasReadyTools(name, config));
      if (missing.length) this.start(missing, owner, snapshot.tools);
    }
    return { snapshot, complete: ready.size === enabled.length };
  }

  cancel(): void {
    this.active?.abort.abort(new DOMException('MCP background discovery was retired.', 'AbortError'));
  }

  async close(): Promise<void> {
    this.cancel();
    await this.active?.settled;
  }

  private start(missing: readonly [string, ScopedMcpServerConfig][], owner: DiscoveryOwner, ready: readonly McpToolDescriptor[]): void {
    const abort = new AbortController();
    const signal = owner.signal ? AbortSignal.any([owner.signal, abort.signal]) : abort.signal;
    const timeout = new McpCatalogLimitError('deadline');
    const deadline = Date.now() + this.timeoutMs;
    const timer = setTimeout(() => abort.abort(timeout), this.timeoutMs);
    let next = 0;
    let bytes = Buffer.byteLength(JSON.stringify(ready));
    let count = ready.length;
    let full = false;
    const admit = (tools: readonly McpToolDescriptor[]): boolean => {
      const usedBytes = Buffer.byteLength(JSON.stringify(tools));
      if (bytes + usedBytes > MCP_CATALOG_BYTES || count + tools.length > MCP_CATALOG_TOOLS) {
        full = true;
        return false;
      }
      bytes += usedBytes;
      count += tools.length;
      return true;
    };
    const workers = Array.from({ length: Math.min(missing.length, DISCOVERY_CONCURRENCY) }, async () => {
      while (!signal.aborted && !full && next < missing.length) {
        const [name, config] = missing[next++]!;
        this.lastAttempted = name;
        await this.read(name, config, owner, signal, deadline, admit);
      }
    });
    const settled = Promise.allSettled(workers).then(() => {
      clearTimeout(timer);
      this.active = undefined;
      if (signal.reason === timeout) createComponentLogger('mcp').warn(timeout.safeDetail);
    });
    this.active = { abort, settled };
  }

  private async read(name: string, config: ScopedMcpServerConfig, owner: DiscoveryOwner, signal: AbortSignal, deadline: number,
    admit: (tools: readonly McpToolDescriptor[]) => boolean): Promise<void> {
    const admission: Admission = () => {
      const blocked = owner.admission?.();
      if (blocked) return blocked;
      return JSON.stringify(owner.current()[name]) === JSON.stringify(config)
        ? undefined : 'MCP workspace or server definition changed during discovery.';
    };
    try {
      await this.connections.withToolDiscovery(name, async () => {
        signal.throwIfAborted();
        assertAdmission(admission);
        if (this.connections.hasReadyTools(name, config)) return;
        const client = this.connections.get(name, config, owner.root);
        const state = await client.connect(admission, signal);
        signal.throwIfAborted();
        assertAdmission(admission);
        if (state.type !== 'connected') {
          createComponentLogger('mcp').warn(`MCP background discovery could not list ${name} (${state.type}). ${describeMcpConnectionState(state).doNext}`);
          return;
        }
        const tools = await client.listTools(admission, signal, { deadline });
        if (!admit(tools)) await this.connections.closeOwned(client);
      }, signal);
    } catch (error) {
      if (!signal.aborted) createComponentLogger('mcp').warn(`MCP background discovery failed for ${name}. ${classifyUnknownMcpFailure(error).safeDetail}`);
    }
  }
}
