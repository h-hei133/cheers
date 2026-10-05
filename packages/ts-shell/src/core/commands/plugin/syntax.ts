import type { CommandSyntax } from "../syntax/model.js";

const target = { name: "name", kind: "text", required: true } as const;
export const pluginSyntax: CommandSyntax = {
  name: "plugin", defaultAction: "list", flags: [],
  actions: [
    { name: "list", aliases: ["ls"], summary: "list extension registrations" },
    { name: "add", aliases: ["install"], summary: "record a path or package; no code is loaded", parameters: [{ name: "path-or-package", kind: "text", required: true }] },
    { name: "remove", aliases: ["rm", "uninstall"], summary: "remove a registration", parameters: [target] },
    { name: "enable", summary: "mark a registration enabled", parameters: [target] },
    { name: "disable", summary: "mark a registration disabled", parameters: [target] },
    { name: "search", aliases: ["find"], summary: "explain catalogue availability", parameters: [{ name: "query", kind: "text", rest: true }] },
  ],
};
