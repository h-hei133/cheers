import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { CallToolResultSchema, ListToolsResultSchema, ResultSchema, ErrorCode, McpError, type Tool } from "@modelcontextprotocol/sdk/types.js";
import { packageVersion } from "../version/current.js";
import { McpStdioTransport } from "./stdio.js";
import { McpToolCatalog } from "./catalog.js";
import { projectMcpResult } from "./projection.js";
import { McpClassifiedError, classifyMcpFailure } from "./errorTaxonomy.js";
import type { McpFailureClass } from "./errorTaxonomy.js";
import type { McpConnectionState, McpToolCallResult, McpToolDescriptor, ScopedMcpServerConfig } from "./types.js";

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_TOOL_PAGES = 100;
const MAX_TOOLS = 10_000;

/** One standard MCP connection. Calls with unknown outcomes are never replayed. */
export class CoreMcpClient {
  private client?: Client;
  private transport?: McpStdioTransport;
  private opening?: Promise<McpConnectionState>;
  private connected = false;
  private closed = false;
  private closing?: Promise<void>;
  private readonly abort = new AbortController();
  private catalog?: McpToolCatalog;

  constructor(
    readonly name: string,
    readonly config: ScopedMcpServerConfig,
    private readonly workspaceRoot: string = process.cwd(),
    private readonly timeoutMs: number = REQUEST_TIMEOUT_MS,
  ) {}

  async connect(): Promise<McpConnectionState> {
    if (this.closed) return this.failed("MCP client is closed");
    if (this.config.enabled === false) return { type: "disabled", name: this.name, config: this.config };
    if (this.config.authRequired) return { type: "needs-auth", name: this.name, config: this.config };
    if (this.config.transport !== "stdio") return this.failed(this.unsupported());
    if (!this.config.command) return this.failed("Missing stdio command");
    if (this.connected) return { type: "connected", name: this.name, config: this.config };
    if (this.opening) return this.opening;
    this.opening = this.open();
    try { return await this.opening; }
    finally { this.opening = undefined; }
  }

  private async open(): Promise<McpConnectionState> {
    await this.disposeTransport();
    const client = new Client({ name: "cheers", version: packageVersion() ?? "unknown" }, {
      capabilities: {}, enforceStrictCapabilities: true,
    });
    const transport = new McpStdioTransport({
      command: this.config.command!,
      args: this.config.args,
      cwd: this.workspaceRoot,
      stderr: "pipe",
      maxBufferSize: 10 * 1024 * 1024,
    });
    // Draining avoids blocking the server; raw diagnostics may contain credentials.
    transport.stderr?.on("data", () => {});
    client.onclose = () => { this.connected = false; };
    this.client = client;
    this.transport = transport;
    try {
      await this.withCancellation(signal => client.connect(transport, { timeout: this.timeoutMs, signal }));
      if (this.closed) throw new Error("MCP client closed during connection");
      this.connected = true;
      return { type: "connected", name: this.name, config: this.config };
    } catch (error) {
      await this.disposeTransport();
      return this.failed(classifyMcpFailure({
        failureClass: "server-unavailable",
        detail: error instanceof Error ? error.message : String(error),
      }).safeDetail);
    }
  }

  async listTools(): Promise<McpToolDescriptor[]> {
    const client = await this.requireClient();
    if (!client.getServerCapabilities()?.tools) {
      this.catalog = new McpToolCatalog([]);
      return [];
    }
    const tools: McpToolDescriptor[] = [];
    const metadata: Tool[] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    try {
      for (let page = 0; page < MAX_TOOL_PAGES; page++) {
        // SDK listTools replaces its metadata cache per page; retain the complete catalog ourselves.
        const result = await this.withCancellation(signal => client.request(
          { method: "tools/list", params: cursor ? { cursor } : {} },
          ListToolsResultSchema, { timeout: this.timeoutMs, signal }));
        metadata.push(...result.tools);
        for (const tool of result.tools) tools.push({
          serverName: this.name,
          toolName: tool.name,
          qualifiedName: "mcp__" + this.name + "__" + tool.name,
          description: tool.description ?? "",
          inputSchema: tool.inputSchema,
          ...(tool.annotations ? { annotations: tool.annotations } : {}),
        });
        if (tools.length > MAX_TOOLS) throw new Error("MCP tool catalog exceeds tool limit");
        cursor = result.nextCursor;
        if (cursor === undefined) {
          this.catalog = new McpToolCatalog(metadata);
          return tools;
        }
        if (!cursor || cursors.has(cursor)) throw new Error("MCP tool catalog repeated an invalid cursor");
        cursors.add(cursor);
      }
      throw new Error("MCP tool catalog exceeds page limit");
    } catch (error) {
      throw protocolFailure(error, "protocol");
    }
  }

  async invokeTool(toolName: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    const client = await this.requireClient();
    if (!this.catalog) await this.listTools();
    this.catalog!.assertCallable(toolName);
    let response: unknown;
    try {
      response = await this.withCancellation(signal => client.request(
        { method: "tools/call", params: { name: toolName, arguments: args } }, ResultSchema,
        { timeout: this.timeoutMs, signal }));
    } catch (error) {
      // Remote rejections are protocol failures; returned data is validated separately below.
      throw protocolFailure(error, "protocol");
    }
    const parsed = CallToolResultSchema.safeParse(response);
    if (!parsed.success) throw protocolFailure(new Error("MCP tool returned a malformed result"), "malformed-result");
    this.catalog!.validate(toolName, parsed.data);
    return projectMcpResult(parsed.data);
  }

  close(): Promise<void> {
    this.closed = true;
    this.abort.abort();
    return this.closing ??= this.finishClose();
  }

  private async withCancellation<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    // SDK request listeners stay on their signal after settlement. Give each
    // request its own signal, and release its link to the connection in finally.
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (this.abort.signal.aborted) cancel();
    else this.abort.signal.addEventListener("abort", cancel, { once: true });
    try { return await operation(controller.signal); }
    finally { this.abort.signal.removeEventListener("abort", cancel); }
  }

  private async finishClose(): Promise<void> {
    await this.opening;
    await this.disposeTransport();
  }

  private async disposeTransport(): Promise<void> {
    this.connected = false;
    this.catalog = undefined;
    await this.transport?.close();
    this.client = undefined;
    this.transport = undefined;
  }

  private async requireClient(): Promise<Client> {
    const state = await this.connect();
    if (state.type !== "connected" || !this.client) {
      throw new McpClassifiedError(classifyMcpFailure({
        failureClass: this.config.transport !== "stdio" || !this.config.command ? "config" : "server-unavailable",
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
      + "', which this build does not implement (supported: stdio)";
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
