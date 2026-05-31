import type { SidebarStateSnapshot } from "./sidebarStateModel.js";

export type SidebarQualityStatus = "pass" | "warn" | "fail";
export type SidebarCheckStatus = "pass" | "warn" | "fail";

export interface SidebarStateQualityInput {
  readonly snapshot: SidebarStateSnapshot;
  readonly renderedOutput?: string;
  readonly maxOutputChars?: number;
}

export interface SidebarStateQualityReport {
  readonly qualityStatus: SidebarQualityStatus;
  readonly checks: {
    readonly hasCurrentTaskOrRoute: SidebarCheckStatus;
    readonly hasNextAction: SidebarCheckStatus;
    readonly hasEditStatus: SidebarCheckStatus;
    readonly hasCompactStatus: SidebarCheckStatus;
    readonly hasMemoryStatus: SidebarCheckStatus;
    readonly hasWarmupStatus: SidebarCheckStatus;
    readonly hasValidationStatus: SidebarCheckStatus;
    readonly hasToolAvailabilityStatus: SidebarCheckStatus;
    readonly hasWarningsIfAny: SidebarCheckStatus;
    readonly hasNoRawContentLeak: SidebarCheckStatus;
    readonly hasNoSecretLeak: SidebarCheckStatus;
    readonly hasNoHiddenReasoningLeak: SidebarCheckStatus;
    readonly outputSizeStatus: SidebarCheckStatus;
    readonly eventBudgetStatus: SidebarCheckStatus;
    readonly blockerVisibilityStatus: SidebarCheckStatus;
  };
  readonly warnings: readonly string[];
  readonly blockers: readonly string[];
  readonly evidence: readonly string[];
}

export function checkSidebarStateQuality(
  input: SidebarStateQualityInput,
): SidebarStateQualityReport {
  const encoded = `${JSON.stringify(input.snapshot)}\n${input.renderedOutput ?? ""}`;
  const maxOutputChars = input.maxOutputChars ?? 3600;
  const checks = {
    hasCurrentTaskOrRoute: hasSection(input.snapshot, "task-route") ? "pass" as const : "warn" as const,
    hasNextAction: input.snapshot.nextActions.length > 0 || input.snapshot.recentActivity?.latestNextAction ? "pass" as const : "warn" as const,
    hasEditStatus: hasSection(input.snapshot, "edit") ? "pass" as const : "warn" as const,
    hasCompactStatus: hasSection(input.snapshot, "compact") ? "pass" as const : "warn" as const,
    hasMemoryStatus: hasSection(input.snapshot, "memory") ? "pass" as const : "warn" as const,
    hasWarmupStatus: hasSection(input.snapshot, "warmup") ? "pass" as const : "warn" as const,
    hasValidationStatus: hasSection(input.snapshot, "validation") ? "pass" as const : "warn" as const,
    hasToolAvailabilityStatus: hasSection(input.snapshot, "tools") ? "pass" as const : "warn" as const,
    hasWarningsIfAny: input.snapshot.notices.length > 0 || hasWarningActivity(input.snapshot) ? "pass" as const : "pass" as const,
    hasNoRawContentLeak: rawLeak(encoded) ? "fail" as const : "pass" as const,
    hasNoSecretLeak: secretLeak(encoded) ? "fail" as const : "pass" as const,
    hasNoHiddenReasoningLeak: hiddenReasoningLeak(encoded) ? "fail" as const : "pass" as const,
    outputSizeStatus: (input.renderedOutput?.length ?? 0) <= maxOutputChars ? "pass" as const : "warn" as const,
    eventBudgetStatus:
      (input.snapshot.recentActivity?.events.length ?? 0) <=
      (input.snapshot.recentActivity?.maxVisibleEvents ?? 6)
        ? "pass" as const
        : "warn" as const,
    blockerVisibilityStatus: blockersVisible(input.snapshot) ? "pass" as const : "fail" as const,
  };
  const warnings = Object.entries(checks)
    .filter(([, status]) => status === "warn")
    .map(([name]) => name);
  const blockers = Object.entries(checks)
    .filter(([, status]) => status === "fail")
    .map(([name]) => name);
  return {
    qualityStatus: blockers.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "pass",
    checks,
    warnings,
    blockers,
    evidence: [
      "sidebar-state-quality:pure",
      "sidebar-state-quality:no-provider-call",
      "sidebar-state-quality:no-persistence",
      "sidebar-state-quality:current-state-and-activity-checked",
    ],
  };
}

function hasSection(snapshot: SidebarStateSnapshot, section: string): boolean {
  return snapshot.facts.some((fact) => fact.section === section && fact.visibility === "user-visible");
}

function hasWarningActivity(snapshot: SidebarStateSnapshot): boolean {
  return Boolean(snapshot.recentActivity?.events.some((event) =>
    event.severity === "warning" ||
    event.severity === "blocked" ||
    event.severity === "error"
  ));
}

function blockersVisible(snapshot: SidebarStateSnapshot): boolean {
  const blockerNotices = snapshot.notices.filter((notice) => notice.severity === "blocked");
  const blockerEvents = snapshot.recentActivity?.events.filter((event) => event.severity === "blocked") ?? [];
  return blockerNotices.length === 0 || blockerEvents.length > 0 || blockerNotices.every((notice) => notice.message.trim().length > 0);
}

function rawLeak(value: string): boolean {
  return /\bRAW_[A-Z0-9_]+\b/.test(value) || /\braw (file|recovery|memory|event) content\b/i.test(value);
}

function secretLeak(value: string): boolean {
  return /\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/.test(value);
}

function hiddenReasoningLeak(value: string): boolean {
  return /\b(hidden reasoning|chain[- ]?of[- ]?thought)\b(?!: excluded)/i.test(value);
}
