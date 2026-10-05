import type { CommandSyntax } from "../syntax/model.js";

const target = { name: "server", kind: "text" } as const;
export const mcpSyntax: CommandSyntax = {
  name: "mcp", defaultAction: "status", flags: [],
  actions: [
    { name: "status", summary: "inspect MCP status" },
    { name: "tools", summary: "list tools, optionally for one server", parameters: [target] },
    { name: "doctor", aliases: ["diagnose"], summary: "diagnose MCP state", parameters: [target] },
    { name: "refresh", aliases: ["reconnect"], summary: "refresh MCP connections", parameters: [target] },
  ],
};
