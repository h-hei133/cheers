import type { CommandSyntax } from "../syntax/model.js";

export const todoSyntax: CommandSyntax = {
  name: "todo",
  defaultAction: "list",
  actions: [
    { name: "list", summary: "show the session checklist" },
    { name: "add", summary: "add a task", parameters: [{ name: "task", kind: "text", required: true, rest: true }] },
    { name: "start", summary: "mark a task in progress", parameters: [{ name: "id", kind: "integer", minimum: 1, required: true }] },
    { name: "done", aliases: ["complete"], summary: "mark a task done", parameters: [{ name: "id", kind: "integer", minimum: 1, required: true }] },
    { name: "clear", summary: "clear the session checklist" },
  ],
};
