import type { CommandSyntax } from "../syntax/model.js";

const target = { name: "server", kind: "text" } as const;
export const mcpSyntax: CommandSyntax = {
  name: "mcp", defaultAction: "status", flags: [],
  actions: [
    { name: "status", summary: "inspect MCP status" },
    { name: "tools", summary: "list tools, optionally for one server", parameters: [target] },
    { name: "doctor", aliases: ["diagnose"], summary: "diagnose MCP state", parameters: [target] },
    { name: "refresh", aliases: ["reconnect"], summary: "refresh MCP connections", parameters: [target] },
    { name: "resources", summary: "list the server's resource catalog", parameters: [{ ...target, required: true }] },
    { name: "templates", summary: "list resource URI templates", parameters: [{ ...target, required: true }] },
    { name: "prompts", summary: "list prompt templates and their arguments", parameters: [{ ...target, required: true }] },
    ...(["read", "subscribe", "unsubscribe"] as const).map(name => ({
      name, summary: name === "read" ? "display a resource" : `${name} to resource updates for this connection`,
      parameters: [{ ...target, required: true }, { name: "uri", kind: "text" as const, required: true }],
    })),
    { name: "prompt", summary: "display a prompt without executing it", parameters: [
      { ...target, required: true }, { name: "name", kind: "text", required: true }, { name: "arguments-json", kind: "text" },
    ] },
    { name: "notifications", summary: "inspect bounded notification metadata without connecting", parameters: [target] },
    { name: "cancel", summary: "cancel queued and outstanding MCP content requests" },
  ],
};
