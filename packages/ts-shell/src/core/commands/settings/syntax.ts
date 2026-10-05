import type { CommandSyntax } from "../syntax/model.js";

export const settingsSyntax: CommandSyntax = {
  name: "settings", defaultAction: "", flags: [],
  actions: [
    { name: "", summary: "describe settings available in the panel" },
    { name: "attentionOnIdle", summary: "explain completion notifications" },
    { name: "offline", summary: "explain self-initiated request suppression" },
  ],
};
