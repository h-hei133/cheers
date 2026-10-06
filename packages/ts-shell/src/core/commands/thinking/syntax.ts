import type { ThinkingLevel as ThinkingEffort } from "../../models/effort.js";
import type { CommandAction, CommandSyntax } from "../syntax/model.js";

interface ThinkingAction extends CommandAction {
  readonly effort?: ThinkingEffort | null;
}

export const thinkingSyntax: CommandSyntax<ThinkingAction> = {
  name: "thinking",
  defaultAction: "",
  flags: [{ name: "global", kind: "boolean", summary: "also change the global default" }],
  actions: [
    { name: "", summary: "show the current effort preference" },
    { name: "low", summary: "request low reasoning effort", effort: "low" },
    { name: "medium", summary: "request medium reasoning effort", effort: "medium" },
    { name: "high", summary: "request high reasoning effort", effort: "high" },
    { name: "off", aliases: ["auto", "none"], summary: "let the provider choose its reasoning effort", effort: null },
  ],
};
