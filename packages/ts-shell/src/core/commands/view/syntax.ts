import type { CommandSyntax } from "../syntax/model.js";

export const viewSyntax: CommandSyntax = {
  name: "view", defaultAction: "status", flags: [],
  actions: [
    { name: "status", summary: "inspect the current view" },
    { name: "user", aliases: ["compact"], summary: "show the compact user view" },
    { name: "developer", aliases: ["verbose", "dev"], summary: "show the verbose developer view" },
  ],
};
