import { buildSidebarPanel } from "./sidebarPanelLayout.js";
import { sidebarReport } from './report.js';
import { reportText } from '../../core/commands/report/projection.js';
import type { CommandReport } from '../../core/commands/report/contract.js';
import type { SidebarStateSnapshot } from "./sidebarStateModel.js";
import type { SidebarPanelCommandContract } from "./sidebarPanelCommandContract.js";

export interface RunSidebarPanelCommandInput {
  readonly snapshot: SidebarStateSnapshot;
  readonly contract: SidebarPanelCommandContract;
}

export interface SidebarPanelCommandRunResult {
  readonly report: CommandReport;
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
  const report = sidebarReport(panel);
  return {
    report,
    output: reportText(report),
    evidence: [
      "sidebar-panel-command-runner:read-only",
      "sidebar-panel-command-runner:no-provider-call",
      "sidebar-panel-command-runner:no-dynamic-discovery",
      "sidebar-panel-command-runner:no-persistence",
    ],
  };
}
