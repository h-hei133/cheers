import { checkSidebarPanelQuality, type SidebarPanelQualityStatus } from "./sidebarPanelQuality.js";
import { sidebarPanelTextHasForbiddenContent } from "./sidebarPanelModel.js";
import type { SidebarLivePanelFrame } from "./sidebarLivePanelRuntime.js";

export interface SidebarLivePanelQualityReport {
  readonly qualityStatus: SidebarPanelQualityStatus;
  readonly checks: {
    readonly hasCurrentState: SidebarPanelQualityStatus;
    readonly hasRecentActivity: SidebarPanelQualityStatus;
    readonly hasFrameMetadata: SidebarPanelQualityStatus;
    readonly blockersWarningsVisible: SidebarPanelQualityStatus;
    readonly nextActionVisible: SidebarPanelQualityStatus;
    readonly outputWidthRespected: SidebarPanelQualityStatus;
    readonly outputLineBudgetRespected: SidebarPanelQualityStatus;
    readonly noRawContentLeak: SidebarPanelQualityStatus;
    readonly noSecretLeak: SidebarPanelQualityStatus;
    readonly noHiddenReasoningLeak: SidebarPanelQualityStatus;
    readonly watchOutputBounded: SidebarPanelQualityStatus;
    readonly snapshotCommandUnaffected: SidebarPanelQualityStatus;
  };
  readonly warnings: readonly string[];
  readonly blockers: readonly string[];
  readonly evidence: readonly string[];
}

export function checkSidebarLivePanelQuality(input: {
  readonly frame: SidebarLivePanelFrame;
  readonly renderedOutput: string;
}): SidebarLivePanelQualityReport {
  const base = checkSidebarPanelQuality({
    panel: input.frame.panel,
    renderedOutput: input.renderedOutput,
  });
  const lines = input.renderedOutput.split("\n");
  const encoded = `${JSON.stringify(input.frame)}\n${input.renderedOutput}`;
  const checks = {
    hasCurrentState: input.frame.snapshot.snapshotVersion === "sidebar-state-v1" ? "pass" as const : "fail" as const,
    hasRecentActivity: input.frame.metadata.eventCount > 0 ? "pass" as const : "warn" as const,
    hasFrameMetadata: input.renderedOutput.includes("Frame: #") &&
      input.renderedOutput.includes("Events: visible")
      ? "pass" as const
      : "fail" as const,
    blockersWarningsVisible: blockersWarningsVisible(input.frame, input.renderedOutput) ? "pass" as const : "fail" as const,
    nextActionVisible: base.checks.hasNextAction,
    outputWidthRespected: lines.every((line) => line.length <= input.frame.panel.budget.maxWidth) ? "pass" as const : "fail" as const,
    outputLineBudgetRespected: lines.length <= input.frame.panel.budget.maxLines ? "pass" as const : "warn" as const,
    noRawContentLeak: /\bRAW_[A-Z0-9_]+\b|\braw content\b|\braw (file|recovery|memory|event|content) content\b/i.test(encoded)
      ? "fail" as const
      : "pass" as const,
    noSecretLeak: /\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/.test(encoded)
      ? "fail" as const
      : "pass" as const,
    noHiddenReasoningLeak: /\b(hidden reasoning|chain[- ]?of[- ]?thought)\b/i.test(encoded)
      ? "fail" as const
      : "pass" as const,
    watchOutputBounded: lines.length <= input.frame.panel.budget.maxLines &&
      lines.every((line) => line.length <= input.frame.panel.budget.maxWidth)
      ? "pass" as const
      : "fail" as const,
    snapshotCommandUnaffected: input.renderedOutput.includes("Live/watch preview") &&
      !input.renderedOutput.includes("State preview only: no actual sidebar UI exists yet.")
      ? "pass" as const
      : "fail" as const,
  };
  const warnings = Object.entries(checks)
    .filter(([, status]) => status === "warn")
    .map(([name]) => name);
  const blockers = Object.entries(checks)
    .filter(([, status]) => status === "fail")
    .map(([name]) => name);
  return {
    qualityStatus: sidebarPanelTextHasForbiddenContent(encoded) || blockers.length > 0
      ? "fail"
      : warnings.length > 0 || base.qualityStatus === "warn"
        ? "warn"
        : "pass",
    checks,
    warnings,
    blockers,
    evidence: [
      "sidebar-live-panel-quality:frame-metadata-checked",
      "sidebar-live-panel-quality:budget-checked",
      "sidebar-live-panel-quality:redaction-checked",
      "sidebar-live-panel-quality:no-provider-call",
      "sidebar-live-panel-quality:no-persistence",
    ],
  };
}

function blockersWarningsVisible(frame: SidebarLivePanelFrame, output: string): boolean {
  const importantLines = frame.panel.sections.flatMap((section) =>
    section.lines.filter((line) =>
      line.severity === "warning" ||
      line.severity === "blocked" ||
      line.severity === "error"
    )
  );
  return importantLines.every((line) => output.includes(line.text.slice(0, 24)));
}
