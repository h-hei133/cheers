import { SHELL_BACKENDS } from "../../shell/platform/types.js";
import type { CommandSyntax } from "../syntax/model.js";

export const shellSyntax: CommandSyntax = {
  name: "shell", defaultAction: "status", flags: [],
  actions: [
    { name: "status", aliases: ["diag", "info"], summary: "inspect shell diagnostics" },
    { name: "use", aliases: ["set"], summary: "select an available shell backend", parameters: [{ name: "backend", kind: "text", required: true, values: SHELL_BACKENDS }] },
    { name: "auto", aliases: ["reset"], summary: "restore automatic shell detection" },
  ],
};
