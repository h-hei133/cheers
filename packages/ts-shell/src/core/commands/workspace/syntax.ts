import type { CommandSyntax } from "../syntax/model.js";

const target = { name: "path", kind: "text" } as const;
export const workspaceSyntax: CommandSyntax = {
  name: "workspace", defaultAction: "status", flags: [],
  actions: [
    { name: "status", aliases: ["current"], summary: "inspect the workspace binding" },
    { name: "attach", aliases: ["switch", "use"], summary: "attach a workspace path", parameters: [target] },
    { name: 'add', summary: 'add a read-only file root, or explicitly grant write access', parameters: [{ ...target, required: true }], flags: [
      { name: 'write', kind: 'boolean', summary: 'allow approved file edits in this additional root' },
    ] },
    { name: 'remove', summary: 'remove an additional root without deleting files', parameters: [{ ...target, required: true }] },
    { name: 'rebind', summary: 'migrate this saved session to a different primary workspace', parameters: [{ ...target, required: true }] },
    { name: "recent", aliases: ["projects"], summary: "list recent projects" },
  ],
};
export const cdSyntax: CommandSyntax = {
  name: "cd", defaultAction: "", flags: [],
  actions: [{ name: "", summary: "attach a path or inspect the workspace", parameters: [target] }],
};
