import { assertAdmission, type Admission } from "../network/admission.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { CallToolResultSchema, ListToolsResultSchema, ToolListChangedNotificationSchema, ResultSchema, ErrorCode, McpError, type Tool } from "@modelcontextprotocol/sdk/types.js";
import { packageVersion } from "../version/current.js";
import { McpStdioTransport } from "./stdio.js";
import { McpHttpTransport } from './http/transport.js';
import type { McpHttpAuthorization } from './http/fetch.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { McpToolCatalog } from "./catalog.js";
import { projectMcpResult } from "./projection.js";
import { McpContentChannel } from "./content/channel.js";
import type { McpContentRequest, McpContentResult, McpNotificationSnapshot } from "./content/types.js";
import { McpClassifiedError, classifyMcpFailure } from "./errorTaxonomy.js";
import type { McpFailureClass } from "./errorTaxonomy.js";
import {
  MCP_CATALOG_BYTES,
  MCP_CATALOG_TIMEOUT_MS,
  MCP_CATALOG_TOOLS,
  McpCatalogLimitError,
} from './catalogLimit.js';
import type { McpConnectionState, McpToolCallResult, McpToolDescriptor, McpToolInvocation, ScopedMcpServerConfig } from "./types.js";

const MAX_TOOL_PAGES = 100;

export interface McpToolListOptions {
  readonly deadline?: number;
}

/** One standard MCP connection. Calls with unknown outcomes are never replayed. */
export class CoreMcpClient {
  private client?: Client;
  private transport?: Transport;
  private opening?: Promise<McpConnectionState>;
  private connected = false;
  private closed = false;
  private closing?: Promise<void>;
  private readonly abort = new AbortController();
  private catalog?: McpToolCatalog;
  private contractCatalog?: McpToolCatalog;
  private listedTools?: McpToolDescriptor[];
  private catalogRevision = 0;
  private contentChannel?: McpContentChannel;

  constructor(
    readonly name: string,
    readonly config: ScopedMcpServerConfig,
    private readonly workspaceRoot: string = process.cwd(),
    private readonly timeoutMs: number = MCP_CATALOG_TIMEOUT_MS,
    private readonly changed?: () => void,
    private readonly authorization?: McpHttpAuthorization,
  ) {}

  async connect(admission?: Admission, signal?: AbortSignal): Promise<McpConnectionState> {
    assertAdmission(admission);
    signal?.throwIfAborted();
    if (this.closed) return this.failed("MCP client is closed");
    if (this.config.enabled === false) return { type: "disabled", name: this.name, config: this.config };
    if (this.config.authRequired && this.config.transport !== 'http') return { type: "needs-auth", name: this.name, config: this.config };
    if (this.config.transport !== "stdio" && this.config.transport !== 'http') return this.failed(this.unsupported());
    if (this.config.transport === 'stdio' && !this.config.command) return this.failed("Missing stdio command");
    if (this.config.transport === 'http' && !this.config.url) return this.failed('Missing HTTP URL');
    if (this.connected) return { type: "connected", name: this.name, config: this.config };
    if (this.opening) return this.opening;
    this.opening = this.open(admission, signal);
    try { return await this.opening; }
    finally { this.opening = undefined; }
  }

  private async open(admission?: Admission, signal?: AbortSignal): Promise<McpConnectionState> {
    this.listedTools = undefined;
    this.changed?.();
    await this.disposeTransport();
    assertAdmission(admission);
    this.abort.signal.throwIfAborted();
    signal?.throwIfAborted();
    const client = new Client({ name: "cheers", version: packageVersion() ?? "unknown" }, {
      capabilities: {}, enforceStrictCapabilities: true,
    });
    const transport = this.config.transport === 'http' ? new McpHttpTransport(this.config, admission, this.authorization) : new McpStdioTransport({
      command: this.config.command!,
      args: this.config.args,
      env: this.config.env,
      cwd: this.workspaceRoot,
      stderr: "pipe",
      maxBufferSize: 10 * 1024 * 1024,
    }, admission);
    // Draining avoids blocking the server; raw diagnostics may contain credentials.
    if (transport instanceof McpStdioTransport) transport.stderr?.on("data", () => {});
    client.onerror = () => {
      if (this.client !== client || !(transport instanceof McpHttpTransport)) return;
      this.connected = false; this.catalogRevision++; this.listedTools = undefined; this.changed?.();
      void transport.close().catch(() => {});
    };
    client.onclose = () => {
      if (this.client !== client) return;
      this.connected = false;
      this.catalogRevision++;
      this.listedTools = undefined;
      this.changed?.();
    };
    client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
      if (this.client !== client) return;
      this.contentChannel?.notifications.record("notifications/tools/list_changed");
      this.catalogRevision++;
      this.catalog = undefined;
      this.listedTools = undefined;
      this.changed?.();
    });
    this.client = client;
    this.transport = transport;
    this.contentChannel = new McpContentChannel(client, () => !this.closed && this.client === client && this.connected, this.changed);
    try {
      await this.withCancellation(signal => client.connect(transport, { timeout: this.timeoutMs, signal }), signal);
      assertAdmission(admission);
      signal?.throwIfAborted();
      if (this.closed) throw new Error("MCP client closed during connection");
      this.connected = true;
      return { type: "connected", name: this.name, config: this.config };
    } catch (error) {
      await this.disposeTransport();
      if (signal?.aborted) throw signal.reason ?? error;
      const failure = transport instanceof McpHttpTransport ? transport.failure ?? error : error;
      if (failure instanceof McpClassifiedError && failure.failureClass === 'permission-denied') return { type: 'needs-auth', name: this.name, config: this.config };
      return this.failed(classifyMcpFailure({
        failureClass: "server-unavailable",
        detail: failure instanceof Error ? failure.message : String(failure),
      }).safeDetail);
    }
  }

  async listTools(admission?: Admission, signal?: AbortSignal, options?: McpToolListOptions): Promise<McpToolDescriptor[]> {
    this.listedTools = undefined;
    this.changed?.();
    const client = await this.requireClient(admission, signal);
    assertAdmission(admission);
    signal?.throwIfAborted();
    const revision = ++this.catalogRevision;
    if (!client.getServerCapabilities()?.tools) {
      this.catalog = new McpToolCatalog([]);
      this.listedTools = [];
      this.changed?.();
      return [];
    }
    const tools: McpToolDescriptor[] = [];
    const metadata: Tool[] = [];
    const cursors = new Set<string>();
    const deadline = Math.min(Date.now() + this.timeoutMs, options?.deadline ?? Infinity);
    let bytes = 0;
    let cursor: string | undefined;
    try {
      for (let page = 0; page < MAX_TOOL_PAGES; page++) {
        assertAdmission(admission);
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new McpCatalogLimitError('deadline');
        // SDK listTools replaces its metadata cache per page; retain the complete catalog ourselves.
        const result = await this.withCancellation(signal => client.request(
          { method: "tools/list", params: cursor ? { cursor } : {} },
          ListToolsResultSchema, { timeout: remaining, signal }), signal);
        assertAdmission(admission);
        signal?.throwIfAborted();
        if (this.closed || !this.connected || revision !== this.catalogRevision) throw new Error("MCP tool catalog changed during listing");
        bytes += Buffer.byteLength(JSON.stringify(result), "utf8");
        if (bytes > MCP_CATALOG_BYTES) throw new McpCatalogLimitError('bytes');
        if (tools.length + result.tools.length > MCP_CATALOG_TOOLS) throw new McpCatalogLimitError('tools');
        metadata.push(...result.tools);
        for (const tool of result.tools) tools.push({
          serverName: this.name,
          toolName: tool.name,
          qualifiedName: "mcp__" + this.name + "__" + tool.name,
          description: tool.description ?? "",
          inputSchema: tool.inputSchema,
          ...(tool.annotations ? { annotations: tool.annotations } : {}),
        });
        cursor = result.nextCursor;
        if (cursor === undefined) {
          this.catalog = new McpToolCatalog(metadata, this.contractCatalog);
          this.contractCatalog = this.catalog;
          const bound = tools.map(tool => ({ ...tool, contractId: this.catalog!.contractId(tool.toolName)! }));
          this.listedTools = structuredClone(bound);
          this.changed?.();
          return bound;
        }
        if (!cursor || cursors.has(cursor)) throw new Error("MCP tool catalog repeated an invalid cursor");
        cursors.add(cursor);
      }
      throw new Error("MCP tool catalog exceeds page limit");
    } catch (error) {
      if (error instanceof McpCatalogLimitError) throw error;
      throw protocolFailure(error, "protocol");
    }
  }

  /** Inspect only a live, fully read catalog; never connect or issue tools/list. */
  peekTools(): McpToolDescriptor[] | undefined {
    return !this.closed && this.connected && this.listedTools !== undefined
      ? structuredClone(this.listedTools) : undefined;
  }

  async content(request: McpContentRequest, admission?: Admission, signal?: AbortSignal): Promise<McpContentResult> {
    try {
      await this.requireClient(admission, signal);
      const channel = this.contentChannel!;
      return await this.withCancellation(signal => channel.run(request, signal, this.timeoutMs, admission), signal);
    } catch (error) {
      throw protocolFailure(error, "protocol");
    }
  }

  notifications(): McpNotificationSnapshot {
    const live = !this.closed && this.connected && this.contentChannel;
    return { serverName: this.name, state: live ? "live" : "not-connected",
      ...(live ? live.notifications.snapshot() : { entries: [], dropped: 0 }) };
  }

  async invokeTool(toolName: string, args: Record<string, unknown>, admission?: Admission, options?: McpToolInvocation): Promise<McpToolCallResult> {
    const signal = options?.signal;
    const client = await this.requireClient(admission, signal);
    if (!this.catalog) await this.listTools(admission, signal);
    const catalog = this.catalog!;
    catalog.assertCallable(toolName, options?.contractId);
    let response: unknown;
    assertAdmission(admission);
    signal?.throwIfAborted();
    try {
      response = await this.withCancellation(signal => client.request(
        { method: "tools/call", params: { name: toolName, arguments: args } }, ResultSchema,
        { timeout: this.timeoutMs, signal }), signal);
    } catch (error) {
      if (signal?.aborted) throw new McpClassifiedError(classifyMcpFailure({ failureClass: 'timeout-cancelled',
        detail: 'MCP tool result is unconfirmed after cancellation; remote effects may have occurred. No operation was replayed.' }));
      // Remote rejections are protocol failures; returned data is validated separately below.
      throw protocolFailure(error, "protocol");
    }
    const parsed = CallToolResultSchema.safeParse(response);
    if (!parsed.success) throw protocolFailure(new Error("MCP tool returned a malformed result"), "malformed-result");
    catalog.validate(toolName, parsed.data);
    return projectMcpResult(parsed.data);
  }

  close(): Promise<void> {
    this.closed = true;
    this.changed?.();
    this.abort.abort();
    return this.closing ??= this.finishClose();
  }

  private async withCancellation<T>(operation: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    // SDK request listeners stay on their signal after settlement. Give each
    // request its own signal, and release its link to the connection in finally.
    const controller = new AbortController();
    const close = () => controller.abort(this.abort.signal.reason);
    const cancel = () => controller.abort(signal?.reason);
    if (this.abort.signal.aborted) close();
    else this.abort.signal.addEventListener("abort", close, { once: true });
    if (signal?.aborted) cancel();
    else signal?.addEventListener("abort", cancel, { once: true });
    try { return await operation(controller.signal); }
    catch (error) {
      // The SDK may surface its own timeout/AbortError after a caller-supplied
      // reason has already fired. Preserve the reason that owns this boundary.
      if (signal?.aborted) throw signal.reason ?? error;
      if (this.abort.signal.aborted) throw this.abort.signal.reason ?? error;
      throw error;
    }
    finally {
      this.abort.signal.removeEventListener("abort", close);
      signal?.removeEventListener("abort", cancel);
    }
  }

  private async finishClose(): Promise<void> {
    try { await this.opening; }
    catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) throw error;
    } finally { await this.disposeTransport(); }
  }

  private async disposeTransport(): Promise<void> {
    this.connected = false;
    this.catalog = undefined;
    this.contractCatalog = undefined;
    this.contentChannel = undefined;
    await this.transport?.close();
    this.client = undefined;
    this.transport = undefined;
  }

  private async requireClient(admission?: Admission, signal?: AbortSignal): Promise<Client> {
    const state = await this.connect(admission, signal);
    assertAdmission(admission);
    if (state.type !== "connected" || !this.client) {
      throw new McpClassifiedError(classifyMcpFailure({
        failureClass: state.type === 'needs-auth' ? 'permission-denied' : !['stdio', 'http'].includes(this.config.transport)
          || this.config.transport === 'stdio' && !this.config.command || this.config.transport === 'http' && !this.config.url ? 'config' : "server-unavailable",
        detail: state.type === "failed" ? state.error : "MCP server " + this.name + " is " + state.type,
      }));
    }
    return this.client;
  }

  private failed(error: string): McpConnectionState {
    return { type: "failed", name: this.name, config: this.config, error };
  }

  private unsupported(): string {
    return "MCP server '" + this.name + "' is configured with transport '" + this.config.transport
      + "', which this build does not implement (supported: stdio, http)";
  }
}

function protocolFailure(error: unknown, fallback: McpFailureClass): McpClassifiedError {
  if (error instanceof McpClassifiedError) return error;
  const failureClass = error instanceof Error && error.name === "AbortError" ? "timeout-cancelled" : error instanceof McpError
    ? error.code === ErrorCode.ConnectionClosed ? "stdio-process"
      : error.code === ErrorCode.RequestTimeout ? "timeout-cancelled"
        : error.code === ErrorCode.InvalidParams ? fallback : "protocol"
    : fallback;
  return new McpClassifiedError(classifyMcpFailure({
    failureClass,
    detail: error instanceof Error ? error.message : String(error),
  }));
}
