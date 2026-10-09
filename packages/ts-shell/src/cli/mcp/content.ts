import type { CoreMcpGateway } from "../../core/mcp/gateway.js";
import type { McpContentRequest } from "../../core/mcp/content/types.js";
import { renderMcpContent, renderMcpNotifications } from "../../presentation/mcp/content.js";
import { parseSyntax } from "../../core/commands/syntax/parse.js";
import { mcpSyntax } from "../../core/commands/mcp/syntax.js";
import { tokenizeCommandArgs } from "../../core/commands/arguments.js";

export async function runMcpContentCommand(input: {
  readonly renderer: { renderLine(line: string): void };
  readonly gateway: Partial<Pick<CoreMcpGateway, "content" | "notifications" | "cancelContent">>;
  readonly mcpAction?: string;
  readonly mcpTarget?: string;
  readonly mcpContent?: McpContentRequest;
  readonly signal?: AbortSignal;
}): Promise<boolean> {
  if (input.mcpAction === "cancel") {
    if (!input.gateway.cancelContent) throw new Error("MCP content cancellation is unavailable in this host");
    input.gateway.cancelContent();
    input.renderer.renderLine("MCP content cancellation requested; outstanding requests may still be settling.");
    return true;
  }
  if (input.mcpAction === "notifications") {
    if (!input.gateway.notifications) throw new Error("MCP notifications are unavailable in this host");
    input.renderer.renderLine(renderMcpNotifications(input.gateway.notifications(input.mcpTarget)));
    return true;
  }
  if (input.mcpAction !== "content") return false;
  if (!input.gateway.content || !input.mcpTarget || !input.mcpContent) throw new Error("MCP content request is unavailable or incomplete");
  input.renderer.renderLine(renderMcpContent(await input.gateway.content(input.mcpTarget, input.mcpContent, input.signal)));
  return true;
}

export function isMcpControl(text: string): boolean {
  return mcpControl(text) !== undefined;
}

export function mcpControl(text: string): { action: "cancel" | "notifications"; target?: string } | undefined {
  const parsed = parseMcpInput(text);
  if (!parsed?.ok || (parsed.action.name !== "cancel" && parsed.action.name !== "notifications")) return undefined;
  return { action: parsed.action.name, target: parsed.args[0] };
}

export function isMcpContent(text: string): boolean {
  const parsed = parseMcpInput(text);
  return Boolean(parsed?.ok && ["resources", "templates", "prompts", "read", "prompt", "subscribe", "unsubscribe"].includes(parsed.action.name));
}

function parseMcpInput(text: string): ReturnType<typeof parseSyntax> | undefined {
  const match = /^\/mcp(?:\s+([\s\S]*))?$/i.exec(text.trim());
  if (!match) return undefined;
  try {
    return parseSyntax(mcpSyntax, tokenizeCommandArgs(match[1] ?? ""));
  } catch { return undefined; }
}
