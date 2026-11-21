import { sameValue } from '../../config/values.js';
import { assertAdmission, type Admission } from '../network/admission.js';
import { MCP_CATALOG_BYTES, MCP_CATALOG_TOOLS, McpCatalogLimitError } from './catalogLimit.js';
import { selectMcpServers } from './config/selection.js';
import { McpContentLifetime } from './content/lifetime.js';
import type { McpContentRequest } from './content/types.js';
import { classifyMcpFailure, McpClassifiedError } from './errorTaxonomy.js';
import { CoreMcpGateway, type McpDefinitionSource, type McpGateway } from './gateway.js';
import type { McpClientSnapshot, McpServerFilter, McpToolInvocation } from './types.js';

/** Reuse configured connections and keep extension connections in a session-owned gateway. */
export class McpSessionGateway implements McpGateway {
  private readonly local: CoreMcpGateway;
  private readonly sharedContent = new McpContentLifetime();
  private closed = false;

  constructor(private readonly shared: CoreMcpGateway, root: () => string,
    private readonly configured: () => Admission, definitions: McpDefinitionSource) {
    this.local = new CoreMcpGateway(root, configured, undefined, undefined, {
      read: root => {
        const local = Object.entries(definitions.read(root));
        if (local.length === 0) return {};
        const ordinary = shared.loadConfigs('current');
        return Object.fromEntries(local.filter(([name]) => !Object.hasOwn(ordinary, name)));
      },
      subscribe: definitions.subscribe,
    }, () => Object.create(null));
  }

  subscribe(changed: () => void): () => void {
    const shared = this.shared.subscribe(changed), local = this.local.subscribe(changed);
    return () => { local(); shared(); };
  }

  loadConfigs() {
    const ordinary = this.shared.loadConfigs('current');
    const local = this.local.loadConfigs('current');
    return Object.assign(Object.create(null), local, ordinary) as ReturnType<CoreMcpGateway['loadConfigs']>;
  }

  async snapshot(admission?: Admission, signal?: AbortSignal, filter?: McpServerFilter): Promise<McpClientSnapshot> {
    const selection = this.selection(admission, filter);
    if (selection.localOnly) {
      const snapshot = await this.local.snapshot(selection.admission, signal, selection.local);
      signal?.throwIfAborted();
      assertAdmission(selection.admission);
      return snapshot;
    }
    const shared = this.shared.snapshot(selection.admission, signal, selection.shared);
    if (!selection.local) return shared;
    const snapshots = await Promise.all([shared, this.local.snapshot(selection.admission, signal, selection.local)]);
    assertAdmission(selection.admission);
    return merge(...snapshots);
  }

  async availableSnapshot(admission?: Admission, signal?: AbortSignal, filter?: McpServerFilter) {
    const selection = this.selection(admission, filter);
    if (selection.localOnly) {
      const available = await this.local.availableSnapshot(selection.admission, signal, selection.local);
      signal?.throwIfAborted();
      assertAdmission(selection.admission);
      return available;
    }
    const shared = this.shared.availableSnapshot(selection.admission, signal, selection.shared);
    if (!selection.local) return shared;
    const [ordinary, extensions] = await Promise.all([shared, this.local.availableSnapshot(selection.admission, signal, selection.local)]);
    assertAdmission(selection.admission);
    const snapshot = merge(ordinary.snapshot, extensions.snapshot, true);
    return { snapshot, complete: ordinary.complete && extensions.complete && snapshot.clients.length === ordinary.snapshot.clients.length + extensions.snapshot.clients.length };
  }

  peekSnapshot(filter?: McpServerFilter): McpClientSnapshot | undefined {
    if (this.closed) return undefined;
    const shared = this.shared.peekSnapshot(filter);
    if (!shared) return undefined;
    const local = this.local.peekSnapshot(filter);
    if (!local) return undefined;
    const snapshot = merge(shared, local, true);
    return snapshot.clients.length === shared.clients.length + local.clients.length ? snapshot : undefined;
  }

  async refresh(target = 'all', options?: Parameters<CoreMcpGateway['refresh']>[1]): Promise<McpClientSnapshot> {
    const name = target.trim();
    const all = !options?.exactTarget && !options?.expectedConfig && (!name || name.toLowerCase() === 'all');
    const selection = this.selection(options?.admission, all ? undefined : candidate => candidate === name);
    const guarded = { ...options, exactTarget: options?.exactTarget ?? false, admission: selection.admission };
    if (!selection.local) return this.shared.refresh(target, guarded);
    const local = this.local.refresh(target, guarded);
    if (!all) return local;
    const snapshots = await Promise.all([this.shared.refresh(target, guarded), local]);
    assertAdmission(selection.admission);
    return merge(...snapshots);
  }

  async configurationChanged(target?: string): Promise<void> {
    // Persisted definitions belong to the caller. Any newly shadowed local connection is also revoked.
    await Promise.all([this.shared.configurationChanged(target), this.local.configurationChanged(target)]);
  }

  async invokeTool(server: string, tool: string, args: Record<string, unknown>, admission?: Admission, options?: McpToolInvocation) {
    const selection = this.selection(admission, name => name === server);
    if (!selection.local) return this.shared.invokeTool(server, tool, args, selection.admission, options);
    const result = await this.local.invokeTool(server, tool, args, selection.admission, options);
    try { options?.signal?.throwIfAborted(); assertAdmission(selection.admission); }
    catch {
      throw new McpClassifiedError(classifyMcpFailure({ failureClass: 'unknown',
        detail: 'MCP tool result is unconfirmed because session admission or server selection changed after dispatch. No operation was replayed.' }));
    }
    return result;
  }

  async content(server: string, request: McpContentRequest, signal?: AbortSignal) {
    const selection = this.selection(undefined, name => name === server);
    if (selection.local) return this.local.content(server, request, signal, { admission: selection.admission });
    const lifetime = this.sharedContent.begin(signal);
    try { return await this.shared.content(server, request, lifetime.signal, { admission: selection.admission, shared: true }); }
    finally { lifetime.dispose(); }
  }

  cancelContent(): void {
    this.sharedContent.cancel();
    this.local.cancelContent();
  }

  notifications(target?: string) {
    if (this.closed) throw new Error('MCP gateway is closed');
    if (target) return (Object.hasOwn(this.local.loadConfigs('current'), target) ? this.local : this.shared).notifications(target);
    return [...this.shared.notifications(), ...this.local.notifications()];
  }

  async syncWorkspace(): Promise<void> {
    await Promise.all([this.shared.syncWorkspace(), this.local.syncWorkspace()]);
  }

  close(): Promise<void> {
    this.closed = true;
    this.sharedContent.cancel();
    return this.local.close();
  }

  private selection(caller?: Admission, filter?: McpServerFilter) {
    const configured = this.configured();
    const shared = this.shared.admissionForOperation?.();
    const current = () => selectMcpServers(this.local.loadConfigs('current'), filter);
    const admission = () => this.closed ? 'MCP session gateway is closed.' : configured() ?? caller?.() ?? shared?.();
    assertAdmission(admission);
    const definitions = current();
    const local = Object.keys(definitions).length ? (name: string) => Object.hasOwn(definitions, name) : undefined;
    const ordinary = local ? (name: string) => !local(name) && (!filter || filter(name)) : filter;
    const hasOrdinary = () => Object.keys(this.shared.loadConfigs('current')).some(name => ordinary?.(name));
    const localOnly = Boolean(local && filter && !hasOrdinary());
    return {
      local,
      shared: ordinary,
      localOnly,
      admission: () => admission() ?? (sameValue(current(), definitions) && (!localOnly || !hasOrdinary())
        ? undefined : 'MCP server selection changed.'),
    };
  }
}

function merge(shared: McpClientSnapshot, local: McpClientSnapshot, partial = false): McpClientSnapshot {
  const tools = [...shared.tools, ...local.tools];
  const limit = tools.length > MCP_CATALOG_TOOLS ? 'tools' : Buffer.byteLength(JSON.stringify(tools)) > MCP_CATALOG_BYTES ? 'bytes' : undefined;
  if (!limit) return { tools, clients: [...shared.clients, ...local.clients] };
  if (partial) return shared;
  throw new McpCatalogLimitError(limit);
}
