import type { CommandSyntax } from "../commands/syntax/model.js";

export const workflowSyntax: CommandSyntax = {
  name: "workflow", defaultAction: "status", flags: [],
  actions: [
    { name: "list", aliases: ["templates"], summary: "list project workflow definitions" },
    { name: "run", aliases: ["start"], summary: "execute one project workflow", parameters: [{ name: "name", kind: "text", required: true }] },
    { name: "status", summary: "inspect the last recorded run" },
  ],
};
