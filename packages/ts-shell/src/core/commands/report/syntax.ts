import type { CommandSyntax } from "../syntax/model.js";

export const reportSyntax: CommandSyntax = {
  name: "report", defaultAction: "",
  actions: [{ name: "", summary: "write a redacted diagnostic archive", parameters: [{ name: "path", kind: "text" }] }],
  flags: [{ name: "outside", kind: "boolean", summary: "allow a destination outside the workspace" }],
};
