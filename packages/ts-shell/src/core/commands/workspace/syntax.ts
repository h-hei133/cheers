import type { CommandSyntax } from "../syntax/model.js";

const target = { name: "path", kind: "text" } as const;
export const workspaceSyntax: CommandSyntax = {
  name: "workspace", defaultAction: "status", flags: [],
  actions: [
    { name: "status", aliases: ["current"], summary: "inspect the workspace binding" },
    { name: "attach", aliases: ["switch", "use"], summary: "attach a workspace path", parameters: [target] },
    { name: "recent", aliases: ["projects"], summary: "list recent projects" },
  ],
};
export const cdSyntax: CommandSyntax = {
  name: "cd", defaultAction: "", flags: [],
  actions: [{ name: "", summary: "attach a path or inspect the workspace", parameters: [target] }],
};
