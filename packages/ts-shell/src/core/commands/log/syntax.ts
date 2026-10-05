import type { CommandSyntax } from "../syntax/model.js";

const lines = { name: "lines", kind: "integer", minimum: 1 } as const;
export const logSyntax: CommandSyntax = {
  name: "log", defaultAction: "tail", flags: [],
  actions: [
    { name: "tail", summary: "show recent log entries (default 30)", parameters: [lines] },
    { name: "path", summary: "show the current log path" },
    { name: "export", summary: "export the current log family", parameters: [{ name: "path", kind: "text" }] },
    { name: "help", summary: "show log command usage" },
    { name: "clear", summary: "clear the current log family" },
  ],
};
