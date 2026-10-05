import type { CommandSyntax } from "../syntax/model.js";
import { parseSyntax } from "../syntax/parse.js";

export const modelSyntax: CommandSyntax = {
  name: "model", defaultAction: "",
  actions: [
    { name: "", summary: "show the model catalogue", flags: [] },
    { name: "status", summary: "show active model and connection", flags: [] },
    { name: "refresh", summary: "refresh the model catalogue", flags: [] },
    { name: "config", summary: "prepare the user catalogue file", flags: [] },
    { name: "list", aliases: ["ls"], summary: "list models", parameters: [{ name: "provider", kind: "text" }], flags: [{ name: "refresh", kind: "boolean", summary: "refresh the catalogue" }] },
    { name: "use", aliases: ["set"], summary: "switch the session model", parameters: [{ name: "model-id", kind: "text", required: true }], flags: [{ name: "global", kind: "boolean", summary: "also change the global default" }] },
    { name: "help", aliases: ["--help", "-h"], summary: "show model command usage" },
  ],
};

export function parseModelArgs(args: readonly string[]) {
  const first = args[0]?.toLowerCase();
  const explicit = modelSyntax.actions.some(action => action.name === first || action.aliases?.includes(first ?? ""));
  return parseSyntax(modelSyntax, args.length && !explicit ? ["use", ...args] : args);
}
