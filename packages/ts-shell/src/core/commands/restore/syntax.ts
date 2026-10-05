import type { CommandSyntax } from "../syntax/model.js";

export const restoreSyntax: CommandSyntax = {
  name: "restore",
  defaultAction: "preview",
  actions: [
    { name: "preview", summary: "preview selected snapshot records without writing" },
    { name: "execute", summary: "request restoration; separate execution confirmation is required" },
  ],
  flags: [
    { name: "record", aliases: ["records"], kind: "text", summary: "comma-separated snapshot record IDs", conflicts: ["all"] },
    { name: "all", kind: "boolean", summary: "select all records", conflicts: ["record"] },
    { name: "ledger-root", aliases: ["ledger"], kind: "text", summary: "snapshot ledger directory" },
    { name: "workspace-root", aliases: ["workspace"], kind: "text", summary: "workspace to restore" },
    { name: "authority-id", aliases: ["authority", "route-id", "route"], kind: "text", summary: "restore authority identity" },
    { name: "execute", kind: "boolean", summary: "explicitly confirm execution", suggest: false },
    { name: "confirm", kind: "text", values: ["execute"], summary: "explicitly confirm execution", suggest: false },
    { name: "dry-run", kind: "boolean", summary: "inspect only; do not restore files" },
  ],
};
