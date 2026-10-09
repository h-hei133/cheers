import type { CommandSyntax } from "../syntax/model.js";

const target = { name: "server", kind: "text" } as const;
const scoped = [{ name: "scope", kind: "text", required: true, values: ["user", "project"] }, { ...target, required: true }] as const;
export const mcpSyntax: CommandSyntax = {
  name: "mcp", defaultAction: "status", flags: [],
  actions: [
    { name: "status", summary: "inspect MCP status" },
    { name: "list", summary: "list effective definitions without connecting" },
    { name: "show", summary: "show a redacted effective definition", parameters: [{ ...target, required: true }] },
    ...(["add", "edit"] as const).map(name => ({ name, summary: `${name} a scoped definition from a local JSONC file`,
      parameters: [...scoped, { name: "file", kind: "text" as const, required: true }] })),
    ...(["remove", "enable", "disable"] as const).map(name => ({ name, aliases: name === "remove" ? ["delete"] : undefined,
      summary: `${name} a scoped server definition`, parameters: scoped })),
    { name: "test", summary: "negotiate and discover exactly one server without calling tools", parameters: [{ ...target, required: true }] },
    { name: 'auth', summary: 'explicit OAuth sign-in for one HTTP server', parameters: [{ ...target, required: true }] },
    { name: 'logout', summary: 'remove this definition\'s local MCP credentials', parameters: [{ ...target, required: true }] },
    { name: "tools", summary: "list tools, optionally for one server", parameters: [target] },
    { name: "doctor", aliases: ["diagnose"], summary: "diagnose MCP state", parameters: [target] },
    { name: "refresh", aliases: ["reconnect", "reload"], summary: "reload definitions and refresh MCP connections", parameters: [target] },
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
    { name: "cancel", summary: "cancel queued and outstanding MCP content/configuration requests" },
  ],
};
