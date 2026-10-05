import type { CommandSyntax } from "../../core/commands/syntax/model.js";

export const warmupSyntax: CommandSyntax = {
  name: "warmup", defaultAction: "status", flags: [],
  actions: [
    { name: "status", summary: "inspect the startup context cache" },
    { name: "rebuild", summary: "explicitly rebuild the startup context cache" },
  ],
};
