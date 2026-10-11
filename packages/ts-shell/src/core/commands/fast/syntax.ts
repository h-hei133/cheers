import type { CommandSyntax } from "../syntax/model.js";

export const fastSyntax: CommandSyntax = {
  name: "fast", defaultAction: "", flags: [],
  actions: [
    { name: "", aliases: ['status'], summary: "inspect provider fast service tier" },
    { name: "on", aliases: ["enable", "1"], summary: "use a supported provider priority tier" },
    { name: "off", aliases: ["disable", "0"], summary: "select standard provider processing" },
    { name: "toggle", summary: "toggle the session service tier" },
  ],
};
