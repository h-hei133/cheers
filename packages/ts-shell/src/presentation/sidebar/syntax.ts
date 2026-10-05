import type { CommandSyntax } from "../../core/commands/syntax/model.js";

export const sidebarSyntax: CommandSyntax = {
  name: "sidebar", defaultAction: "", flags: [],
  actions: [
    { name: "", summary: "preview current session state" },
    { name: "snapshot", aliases: ["watch", "live"], summary: "capture state once; run again to refresh" },
    { name: "panel", summary: "preview a terminal panel" },
    { name: "compact", summary: "preview the shortest panel" },
    { name: "detail", summary: "preview the expanded panel" },
  ],
};
export const sidebarSnapshotSyntax: CommandSyntax = { ...sidebarSyntax, defaultAction: undefined, actions: sidebarSyntax.actions.filter(action => action.name === "snapshot") };
export const sidebarPanelSyntax: CommandSyntax = { ...sidebarSyntax, actions: sidebarSyntax.actions.filter(action => action.name !== "snapshot") };
