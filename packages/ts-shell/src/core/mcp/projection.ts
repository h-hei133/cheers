import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpToolCallResult } from "./types.js";

/** Preserve text and structured results; surface content our tool boundary cannot carry. */
export function projectMcpResult(result: CallToolResult): McpToolCallResult {
  const parts: string[] = [];
  let unsupported = false;
  for (const block of result.content) {
    if (block.type === "text") parts.push(block.text);
    else if (block.type === "resource" && "text" in block.resource) {
      parts.push(block.resource.uri + "\n" + block.resource.text);
    } else if (block.type === "resource_link") {
      parts.push(block.name + ": " + block.uri);
    } else {
      unsupported = true;
      parts.push("[Unsupported MCP content: " + block.type + "; execution outcome must be checked]");
    }
  }
  if (result.structuredContent) parts.push(JSON.stringify(result.structuredContent));
  return { content: parts.join("\n"), ...(result.isError || unsupported ? { isError: true } : {}) };
}
