import { createSidebarLivePanelRuntime } from "./sidebarLivePanelRuntime.js";
import { sidebarReport } from './report.js';
import { reportText } from '../../core/commands/report/projection.js';
import type { CommandReport } from '../../core/commands/report/contract.js';
import type { SidebarLivePanelCommandContract } from "./sidebarLivePanelCommandContract.js";
import type { SidebarLiveEventStore } from "./sidebarLiveEventStore.js";
import type { SidebarStateSnapshot } from "./sidebarStateModel.js";

export interface RunSidebarLivePanelCommandInput {
  readonly snapshot: SidebarStateSnapshot;
  readonly sessionScopeId: string;
  readonly contract: SidebarLivePanelCommandContract;
  readonly eventStore?: SidebarLiveEventStore;
  readonly now?: () => string;
}

export interface SidebarLivePanelCommandRunResult {
  readonly report: CommandReport;
  readonly output: string;
  readonly evidence: readonly string[];
}

export function runSidebarLivePanelCommand(
  input: RunSidebarLivePanelCommandInput,
): SidebarLivePanelCommandRunResult {
  const runtime = createSidebarLivePanelRuntime({
    snapshot: input.snapshot,
    sessionScopeId: input.sessionScopeId,
    eventStore: input.eventStore,
    density: input.contract.density,
    budget: input.contract.budget,
    maxFrameHistory: input.contract.frameCount,
    now: input.now,
  });
  const frame = runtime.tick();
  const report = sidebarReport(frame.panel, frame);
  return {
    report,
    output: reportText(report),
    evidence: [
      "sidebar-live-panel-command-runner:read-only",
      "sidebar-live-panel-command-runner:bounded-frame-count",
      "sidebar-live-panel-command-runner:no-provider-call",
      "sidebar-live-panel-command-runner:no-model-call",
      "sidebar-live-panel-command-runner:no-dynamic-discovery",
      "sidebar-live-panel-command-runner:no-persistence",
      "sidebar-live-panel-command-runner:no-indefinite-loop",
    ],
  };
}
