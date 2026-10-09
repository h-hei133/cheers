import type { CommandContext, CommandExecutionResult } from "../types.js";
import { parseSyntax } from "../syntax/parse.js";
import { syntaxHelp } from "../syntax/projection.js";
import { mcpSyntax } from "./syntax.js";
import type { McpContentRequest } from "../../mcp/content/types.js";

export async function runMcpShellAction(args: string[], context: CommandContext): Promise<CommandExecutionResult> {
  const parsed = parseSyntax(mcpSyntax, args);
  if (!parsed.ok) return { kind: "local", output: `Invalid /mcp arguments: ${parsed.reason}\n${syntaxHelp(mcpSyntax)}` };
  const mode = parsed.action.name;
  if (["list", "show", "add", "edit", "remove", "enable", "disable"].includes(mode)) {
    return context.mcpCommand ? context.mcpCommand(args, context) : { kind: "local", output: "MCP configuration management is unavailable in this host." };
  }
  if (mode === "test") return { kind: "shell-action", action: "show-mcp", mcpAction: "test", mcpTarget: parsed.args[0] };
  if (mode === "tools" || mode === "doctor" || mode === "refresh") return { kind: "shell-action", action: "show-mcp", mcpAction: mode, mcpTarget: parsed.args[0] };
  if (mode === "notifications" || mode === "cancel") return { kind: "shell-action", action: "show-mcp", mcpAction: mode, mcpTarget: parsed.args[0] };
  if (mode !== "status") {
    try {
      const request = contentRequest(mode, parsed.args);
      return { kind: "shell-action", action: "show-mcp", mcpAction: "content", mcpTarget: parsed.args[0], mcpContent: request };
    } catch {
      return { kind: "local", output: "Invalid /mcp content arguments. Prompt arguments must be a JSON object of string values (at most 32 KiB)." };
    }
  }
  return { kind: "shell-action", action: "show-mcp", mcpAction: "status" };
}

function contentRequest(action: string, args: readonly string[]): McpContentRequest {
  if (action === "resources" || action === "templates" || action === "prompts") return { action };
  if (action === "read" || action === "subscribe" || action === "unsubscribe") {
    if (args[1]!.length > 8192) throw new Error("URI too long");
    return { action, uri: args[1]! };
  }
  if (action !== "prompt" || args[1]!.length > 8192 || Buffer.byteLength(args[2] ?? "") > 32 * 1024) throw new Error("Invalid prompt");
  const values: unknown = JSON.parse(args[2] ?? "{}");
  if (!values || typeof values !== "object" || Array.isArray(values) || Object.values(values).some(value => typeof value !== "string")) throw new Error("Invalid arguments");
  return { action, name: args[1]!, arguments: values as Record<string, string> };
}
