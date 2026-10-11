import type { CommandSyntax } from "../syntax/model.js";

export const todoSyntax: CommandSyntax = {
  name: "todo",
  defaultAction: "list",
  actions: [
    { name: "list", aliases: ["status"], summary: "show the session checklist" },
    { name: "add", aliases: ["append"], summary: "add a task", parameters: [{ name: "task", kind: "text", required: true, rest: true }] },
    { name: "edit", summary: "replace a task's text", parameters: [{ name: "id", kind: "integer", minimum: 1, required: true }, { name: "task", kind: "text", required: true, rest: true }] },
    { name: "start", summary: "mark a task in progress", parameters: [{ name: "id", kind: "integer", minimum: 1, required: true }] },
    { name: "done", aliases: ["complete"], summary: "mark a task done", parameters: [{ name: "id", kind: "integer", minimum: 1, required: true }] },
    { name: "pending", summary: "return a task to pending", parameters: [{ name: "id", kind: "integer", minimum: 1, required: true }] },
    { name: "drop", summary: "mark a task abandoned", parameters: [{ name: "id", kind: "integer", minimum: 1, required: true }] },
    { name: "rm", summary: "remove a task", parameters: [{ name: "id", kind: "integer", minimum: 1, required: true }] },
    { name: "copy", summary: "copy or print the checklist as Markdown" },
    { name: "export", summary: "export version 1 JSON after file-write approval", parameters: [{ name: "path", kind: "text", required: true }], flags: [] },
    { name: "import", summary: "replace the checklist from bounded version 1 JSON", parameters: [{ name: "path", kind: "text", required: true }], flags: [] },
    { name: "clear", summary: "clear the session checklist" },
  ],
};
