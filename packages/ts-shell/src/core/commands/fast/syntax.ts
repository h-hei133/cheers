import type { CommandSyntax } from "../syntax/model.js";

export const fastSyntax: CommandSyntax = {
  name: "fast", defaultAction: "", flags: [],
  actions: [
    { name: "", summary: "inspect sampling preference" },
    { name: "on", aliases: ["enable", "1"], summary: "use a lower sampling temperature" },
    { name: "off", aliases: ["disable", "0"], summary: "restore default sampling temperature" },
    { name: "toggle", summary: "toggle the sampling preference" },
  ],
};
