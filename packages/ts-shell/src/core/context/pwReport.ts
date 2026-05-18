import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserExecutionRequest } from "./browserExecutionContract.js";
import type { PwFailureCode } from "./pwEvidence.js";
import type { PwRuntimeStatus } from "./pwRuntime.js";

export type PwEvalMode = "real" | "injected" | "skipped";
export type PwEvalOutcome = "pass" | "fail" | "skip";
export type PwDurationBudgetStatus = "within-budget" | "exceeded" | "not-run";
export type PwRedactionStatus = "safe-summary" | "unsafe";

export interface PwReportEntry {
  readonly scenarioId: string;
  readonly operation: BrowserExecutionRequest["actionKind"];
  readonly mode: PwEvalMode;
  readonly outcome: PwEvalOutcome;
  readonly reasonCode: PwFailureCode | "none";
  readonly evidenceSummary: string;
  readonly cleanupStatus: "closed" | "close-failed" | "not-started" | "unknown";
  readonly durationBudget: PwDurationBudgetStatus;
  readonly redactionStatus: PwRedactionStatus;
}

export interface PwCloseoutReport {
  readonly status: "passed" | "failed" | "skipped";
  readonly runtimeStatus: PwRuntimeStatus["status"];
  readonly runtimeReasonCode: PwRuntimeStatus["reasonCode"];
  readonly executableSource: PwRuntimeStatus["executableSource"];
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly entries: readonly PwReportEntry[];
  readonly mcpBackend: "optional-not-default" | "not-wired";
  readonly noProviderModelCalls: true;
  readonly noPublicAutomation: true;
  readonly nextAction: string;
}

export function createPwCloseoutReport(input: {
  readonly runtimeStatus: PwRuntimeStatus;
  readonly entries: readonly PwReportEntry[];
  readonly mcpBackend?: PwCloseoutReport["mcpBackend"];
}): PwCloseoutReport {
  const passed = input.entries.filter((entry) => entry.outcome === "pass").length;
  const failed = input.entries.filter((entry) => entry.outcome === "fail").length;
  const skipped = input.entries.filter((entry) => entry.outcome === "skip").length;
  const status = failed > 0
    ? "failed"
    : input.entries.length > 0 && skipped === input.entries.length
      ? "skipped"
      : "passed";
  return {
    status,
    runtimeStatus: input.runtimeStatus.status,
    runtimeReasonCode: input.runtimeStatus.reasonCode,
    executableSource: input.runtimeStatus.executableSource,
    total: input.entries.length,
    passed,
    failed,
    skipped,
    entries: input.entries,
    mcpBackend: input.mcpBackend ?? "not-wired",
    noProviderModelCalls: true,
    noPublicAutomation: true,
    nextAction: status === "failed"
      ? "Inspect failed Direct Playwright scenarios before widening browser runtime scope."
      : status === "skipped"
        ? input.runtimeStatus.nextAction
        : "Direct Playwright closeout report is usable for controlled local/test runtime validation.",
  };
}

export function renderPwCloseoutReport(report: PwCloseoutReport): string {
  return [
    "Direct Playwright closeout",
    `- Status: ${report.status}`,
    `- Runtime: ${report.runtimeStatus}`,
    `- Runtime reason: ${report.runtimeReasonCode}`,
    `- Executable source: ${report.executableSource}`,
    `- Score: ${report.passed}/${report.total}`,
    `- Failed: ${report.failed}`,
    `- Skipped: ${report.skipped}`,
    `- MCP backend: ${report.mcpBackend}`,
    "- Provider/model call: none",
    "- Public automation: no",
    `- Evidence summary: ${report.entries.map(renderEntrySummary).join("; ") || "none"}`,
    `- Next action: ${sanitizeBrowserText(report.nextAction, 220)}`,
  ].join("\n");
}

export function pwReportEntryFromEvidence(input: {
  readonly scenarioId: string;
  readonly operation: BrowserExecutionRequest["actionKind"];
  readonly mode: PwEvalMode;
  readonly passed: boolean;
  readonly evidence: readonly string[];
  readonly durationMs: number;
  readonly durationBudgetMs: number;
}): PwReportEntry {
  return {
    scenarioId: sanitizeBrowserText(input.scenarioId, 120),
    operation: input.operation,
    mode: input.mode,
    outcome: input.passed ? "pass" : "fail",
    reasonCode: input.passed ? "none" : failureCodeFromEvidence(input.evidence),
    evidenceSummary: sanitizeBrowserText(input.evidence.slice(-6).join(" | "), 260),
    cleanupStatus: cleanupStatusFromEvidence(input.evidence),
    durationBudget: input.durationMs <= input.durationBudgetMs ? "within-budget" : "exceeded",
    redactionStatus: input.evidence.includes("pw-evidence:raw-dom-excluded") ? "safe-summary" : "unsafe",
  };
}

export function skippedPwReportEntry(input: {
  readonly scenarioId: string;
  readonly operation: BrowserExecutionRequest["actionKind"];
  readonly mode?: PwEvalMode;
  readonly reasonCode: PwFailureCode;
  readonly evidenceSummary: string;
}): PwReportEntry {
  return {
    scenarioId: sanitizeBrowserText(input.scenarioId, 120),
    operation: input.operation,
    mode: input.mode ?? "skipped",
    outcome: "skip",
    reasonCode: input.reasonCode,
    evidenceSummary: sanitizeBrowserText(input.evidenceSummary, 260),
    cleanupStatus: "not-started",
    durationBudget: "not-run",
    redactionStatus: "safe-summary",
  };
}

export function failureCodeFromRuntimeStatus(status: PwRuntimeStatus): PwFailureCode {
  return status.reasonCode === "ready" ? "unknown" : status.reasonCode;
}

export function failureCodeFromEvidence(evidence: readonly string[]): PwFailureCode {
  const marker = evidence.find((item) => item.startsWith("pw-evidence:failure:"));
  const value = marker?.slice("pw-evidence:failure:".length);
  return isPwFailureCode(value) ? value : "unknown";
}

function cleanupStatusFromEvidence(evidence: readonly string[]): PwReportEntry["cleanupStatus"] {
  const marker = evidence.find((item) => item.startsWith("pw-evidence:cleanup:"));
  const value = marker?.slice("pw-evidence:cleanup:".length);
  return value === "closed" || value === "close-failed" || value === "not-started" ? value : "unknown";
}

function renderEntrySummary(entry: PwReportEntry): string {
  return sanitizeBrowserText([
    entry.scenarioId,
    entry.mode,
    entry.outcome,
    entry.reasonCode,
    `cleanup=${entry.cleanupStatus}`,
    `redaction=${entry.redactionStatus}`,
  ].join("/"), 180);
}

function isPwFailureCode(value: string | undefined): value is PwFailureCode {
  return !!value && [
    "runtime-package-missing",
    "runtime-binary-missing",
    "runtime-disabled",
    "navigation-timeout",
    "observe-failed",
    "extract-failed",
    "action-target-missing",
    "action-timeout",
    "policy-blocked",
    "cleanup-failed",
    "adapter-invalid-result",
    "unknown",
  ].includes(value);
}
