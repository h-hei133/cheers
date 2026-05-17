import {
  sidebarPanelTextHasForbiddenContent,
  type SidebarPanel,
} from "./sidebarPanelModel.js";

export type SidebarPanelQualityStatus = "pass" | "warn" | "fail";

export interface SidebarPanelQualityReport {
  readonly qualityStatus: SidebarPanelQualityStatus;
  readonly checks: {
    readonly hasHeader: SidebarPanelQualityStatus;
    readonly hasNextAction: SidebarPanelQualityStatus;
    readonly blockersVisible: SidebarPanelQualityStatus;
    readonly activityBudgetRespected: SidebarPanelQualityStatus;
    readonly outputWidthRespected: SidebarPanelQualityStatus;
    readonly outputLineBudgetRespected: SidebarPanelQualityStatus;
    readonly noRawContentLeak: SidebarPanelQualityStatus;
    readonly noSecretLeak: SidebarPanelQualityStatus;
    readonly noHiddenReasoningLeak: SidebarPanelQualityStatus;
    readonly developerOnlyHiddenByDefault: SidebarPanelQualityStatus;
  };
  readonly warnings: readonly string[];
  readonly blockers: readonly string[];
  readonly evidence: readonly string[];
}

export function checkSidebarPanelQuality(input: {
  readonly panel: SidebarPanel;
  readonly renderedOutput: string;
}): SidebarPanelQualityReport {
  const lines = input.renderedOutput.split("\n");
  const encoded = `${JSON.stringify(input.panel)}\n${input.renderedOutput}`;
  const checks = {
    hasHeader: hasSection(input.panel, "header") ? "pass" as const : "fail" as const,
    hasNextAction: hasSection(input.panel, "next-action") ? "pass" as const : "fail" as const,
    blockersVisible: blockersVisible(input.panel, input.renderedOutput) ? "pass" as const : "fail" as const,
    activityBudgetRespected: activityBudgetRespected(input.panel) ? "pass" as const : "warn" as const,
    outputWidthRespected: lines.every((line) => line.length <= input.panel.budget.maxWidth) ? "pass" as const : "fail" as const,
    outputLineBudgetRespected: lines.length <= input.panel.budget.maxLines ? "pass" as const : "warn" as const,
    noRawContentLeak: /\bRAW_[A-Z0-9_]+\b|\braw (file|recovery|memory|event|content) content\b/i.test(encoded)
      ? "fail" as const
      : "pass" as const,
    noSecretLeak: /\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/.test(encoded)
      ? "fail" as const
      : "pass" as const,
    noHiddenReasoningLeak: /\b(hidden reasoning|chain[- ]?of[- ]?thought)\b/i.test(encoded)
      ? "fail" as const
      : "pass" as const,
    developerOnlyHiddenByDefault: encoded.includes("developer-only raw event")
      ? "fail" as const
      : "pass" as const,
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
      : warnings.length > 0
        ? "warn"
        : "pass",
    checks,
    warnings,
    blockers,
    evidence: [
      "sidebar-panel-quality:header-next-blockers-checked",
      "sidebar-panel-quality:budget-checked",
      "sidebar-panel-quality:no-provider-call",
      "sidebar-panel-quality:no-persistence",
    ],
  };
}

function hasSection(panel: SidebarPanel, id: string): boolean {
  return panel.sections.some((section) => section.id === id && section.lines.length > 0);
}

function blockersVisible(panel: SidebarPanel, output: string): boolean {
  const blockerLines = panel.sections
    .find((section) => section.id === "blockers")
    ?.lines.filter((line) => line.severity === "blocked" || line.severity === "error") ?? [];
  return blockerLines.length === 0 || blockerLines.every((line) => output.includes(line.text.slice(0, 24)));
}

function activityBudgetRespected(panel: SidebarPanel): boolean {
  const activity = panel.sections.find((section) => section.id === "activity");
  if (!activity) {
    return true;
  }
  const visibleActivityLines = activity.lines.filter((line) =>
    !line.text.includes("hidden by budget")
  );
  return visibleActivityLines.length <= panel.budget.maxActivityItems || panel.budget.maxActivityItems === 0;
}
