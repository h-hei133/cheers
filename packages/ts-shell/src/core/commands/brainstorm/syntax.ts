import type { CommandSyntax } from "../syntax/model.js";

export const brainstormSyntax: CommandSyntax = {
  name: "brainstorm", defaultAction: "",
  actions: [{ name: "", summary: "explore a problem", parameters: [{ name: "problem", kind: "text", rest: true }] }],
  flags: [
    { name: "interactive", short: "i", kind: "boolean", summary: "ask design questions first", conflicts: ["save"] },
    { name: "save", short: "s", kind: "boolean", summary: "request a saved design after exploration", conflicts: ["interactive"] },
    { name: "help", short: "h", kind: "boolean", summary: "show usage" },
  ],
};
