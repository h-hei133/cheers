import type { CommandSyntax } from "../syntax/model.js";

export const crashSyntax: CommandSyntax = {
  name: "crash", defaultAction: "",
  actions: [{ name: "", summary: "show recent crash records" }],
  flags: [{ name: "stack", kind: "boolean", summary: "include stack traces" }],
};
