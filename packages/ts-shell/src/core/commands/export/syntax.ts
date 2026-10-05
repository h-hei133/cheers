import type { CommandSyntax } from "../syntax/model.js";

const destination = [{ name: "path", kind: "text", required: false }] as const;

export const exportSyntax: CommandSyntax = {
  name: "export",
  defaultAction: "markdown",
  actions: [
    { name: "markdown", aliases: ["md"], summary: "export a redacted Markdown conversation", parameters: destination },
    { name: "jsonl", summary: "export raw transcript records", parameters: destination },
    { name: "html", summary: "export a redacted standalone HTML conversation", parameters: destination },
  ],
  flags: [{ name: "outside", kind: "boolean", summary: "allow a destination outside the workspace" }],
};
