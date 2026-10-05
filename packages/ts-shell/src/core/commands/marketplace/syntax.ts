import type { CommandSyntax } from "../syntax/model.js";

const target = { name: "name", kind: "text", required: true } as const;
export const marketplaceSyntax: CommandSyntax = {
  name: "marketplace", defaultAction: "list", flags: [],
  actions: [
    { name: "list", aliases: ["ls"], summary: "list saved source addresses" },
    { name: "add", summary: "save a source address; no catalogue is fetched", parameters: [target, { name: "url", kind: "text", required: true }] },
    { name: "remove", aliases: ["rm", "delete"], summary: "remove a saved source address", parameters: [target] },
  ],
};
