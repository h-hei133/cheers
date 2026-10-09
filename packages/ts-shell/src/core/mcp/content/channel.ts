import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { assertAdmission, type Admission } from "../../network/admission.js";
import type { McpContentRequest, McpContentResult } from "./types.js";
import { readMcpPages } from "./pages.js";
import { McpNotifications } from "./notifications.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

const MAX_CONTENT_BYTES = 1024 * 1024;

/** Resources and prompts share the negotiated connection; none of their text is executable authority. */
export class McpContentChannel {
  private readonly revisions = { resources: 0, prompts: 0 };
  private readonly reading = new Set<{ uri: string; stale: boolean }>();
  readonly notifications: McpNotifications;

  constructor(private readonly client: Client, private readonly active: () => boolean, changed?: () => void) {
    this.notifications = new McpNotifications(client, active, (kind, uri) => {
      if (kind === "updated") {
        for (const read of this.reading) if (read.uri === uri) read.stale = true;
      } else { this.revisions[kind]++; changed?.(); }
    });
  }

  async run(request: McpContentRequest, signal: AbortSignal, timeoutMs: number, admission?: Admission): Promise<McpContentResult> {
    const capability = request.action === "prompts" || request.action === "prompt" ? "prompts" : "resources";
    const revision = this.revisions[capability];
    const read = request.action === "read" ? { uri: request.uri, stale: false } : undefined;
    if (read) this.reading.add(read);
    const deadline = Date.now() + timeoutMs;
    const options = () => {
      assertAdmission(admission);
      signal.throwIfAborted();
      const catalogChanged = request.action !== "subscribe" && request.action !== "unsubscribe" && revision !== this.revisions[capability];
      if (!this.active() || catalogChanged || read?.stale) throw new Error("MCP content changed during request");
      const timeout = deadline - Date.now();
      if (timeout <= 0) throw new McpError(ErrorCode.RequestTimeout, "MCP content request timed out");
      return { signal, timeout };
    };
    try {
      options();
      if (!this.client.getServerCapabilities()?.[capability]) return { kind: "unsupported", capability };
      const result = await this.execute(request, options);
      options();
      if (Buffer.byteLength(JSON.stringify(result)) > MAX_CONTENT_BYTES && (result.kind === "read" || result.kind === "prompt")) {
        throw new Error("MCP content exceeds size limit");
      }
      return result;
    } finally { if (read) this.reading.delete(read); }
  }

  private async execute(request: McpContentRequest, options: () => { signal: AbortSignal; timeout: number }): Promise<McpContentResult> {
    if (request.action === "resources") {
      const items = await readMcpPages(async cursor => {
        const page = await this.client.listResources({ cursor }, options());
        options();
        return { items: page.resources, nextCursor: page.nextCursor };
      }, item => item.uri);
      return { kind: "resources", items };
    }
    if (request.action === "templates") {
      const items = await readMcpPages(async cursor => {
        const page = await this.client.listResourceTemplates({ cursor }, options());
        options();
        return { items: page.resourceTemplates, nextCursor: page.nextCursor };
      }, item => item.uriTemplate);
      return { kind: "templates", items };
    }
    if (request.action === "prompts") return { kind: "prompts", items: await this.prompts(options) };
    if (request.action === "prompt") {
      const prompt = (await this.prompts(options)).find(item => item.name === request.name);
      if (!prompt) throw new Error("MCP prompt is absent from the current catalog");
      const args = request.arguments ?? {};
      if (Object.entries(args).some(([key, value]) => typeof value !== "string" || !prompt.arguments?.some(item => item.name === key))
        || prompt.arguments?.some(item => item.required && !Object.hasOwn(args, item.name))) throw new Error("Invalid MCP prompt arguments");
      return { kind: "prompt", value: await this.client.getPrompt({ name: request.name, arguments: args }, options()) };
    }
    if (!request.uri || request.uri.length > 8192) throw new Error("Invalid MCP resource URI");
    if (request.action === "read") return { kind: "read", value: await this.client.readResource({ uri: request.uri }, options()) };
    if (!this.client.getServerCapabilities()?.resources?.subscribe) return { kind: "unsupported", capability: "subscriptions" };
    if (request.action === "subscribe") await this.client.subscribeResource({ uri: request.uri }, options());
    else await this.client.unsubscribeResource({ uri: request.uri }, options());
    return { kind: request.action, uri: request.uri };
  }

  private prompts(options: () => { signal: AbortSignal; timeout: number }) {
    return readMcpPages(async cursor => {
      const page = await this.client.listPrompts({ cursor }, options());
      options();
      return { items: page.prompts, nextCursor: page.nextCursor };
    }, item => item.name);
  }
}
