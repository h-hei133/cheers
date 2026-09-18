import { buildSidebarPanel } from "./sidebarPanelLayout.js";
import { renderSidebarPanel } from "./sidebarPanelRenderer.js";
import type { SidebarStateSnapshot } from "./sidebarStateModel.js";
import type { SidebarPanelCommandContract } from "./sidebarPanelCommandContract.js";

export interface RunSidebarPanelCommandInput {
  readonly snapshot: SidebarStateSnapshot;
  readonly contract: SidebarPanelCommandContract;
}

export interface SidebarPanelCommandRunResult {
  readonly output: string;
  readonly evidence: readonly string[];
}

export function runSidebarPanelCommand(
  input: RunSidebarPanelCommandInput,
): SidebarPanelCommandRunResult {
  const panel = buildSidebarPanel(input.snapshot, {
    density: input.contract.density,
    budget: input.contract.budget,
  });
  return {
    output: renderSidebarPanel(panel),
    evidence: [
      "sidebar-panel-command-runner:read-only",
      "sidebar-panel-command-runner:no-provider-call",
      "sidebar-panel-command-runner:no-dynamic-discovery",
      "sidebar-panel-command-runner:no-persistence",
    ],
  };
}
