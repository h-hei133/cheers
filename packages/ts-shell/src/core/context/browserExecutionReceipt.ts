import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserExecutionMode, BrowserExecutionRequest } from "./browserExecutionContract.js";
import type { BrowserExecutorKind, BrowserExecutorResult } from "./browserExecutor.js";
import type { BrowserExecutionPolicyDecision } from "./browserExecutionPolicy.js";
import {
  createBrowserEvidenceBundle,
  type BrowserEvidenceBundle,
} from "./browserEvidenceBundle.js";
import {
  classifyBrowserReplayReadiness,
  type BrowserReplayReadiness,
} from "./browserReplayReadiness.js";
import type { BrowserSkillRunnerMetadata } from "./browserSkillRunnerMetadata.js";
import type { BrowserSkillRunnerReadiness } from "./browserSkillRunnerReadiness.js";

export type BrowserExecutionReceiptId = string;
export type BrowserExecutionReceiptVersion = "browser-execution-receipt/v1";
export type BrowserExecutionReceiptStatus =
  | "executed"
  | "blocked"
  | "failed"
  | "timed-out"
  | "invalid-response"
  | "unavailable"
  | "unsafe-output";
export type BrowserExecutionReceiptSource =
  | "external-runner"
  | "skill-managed"
  | "local-fixture"
  | "fake-test"
  | "playwright-local-unavailable"
  | "dry-run";
export type BrowserExecutionReceiptVisibility = "user-visible" | "developer-only" | "hidden";

export interface BrowserExecutionReceipt {
  readonly receiptId: BrowserExecutionReceiptId;
  readonly version: BrowserExecutionReceiptVersion;
  readonly createdAt: string;
  readonly status: BrowserExecutionReceiptStatus;
  readonly source: BrowserExecutionReceiptSource;
  readonly visibility: BrowserExecutionReceiptVisibility;
  readonly actionKind: BrowserExecutionRequest["actionKind"];
  readonly executionMode: BrowserExecutionMode;
  readonly runnerId: string;
  readonly runnerSource: string;
  readonly manifestId: string;
  readonly manifestSource: string;
  readonly fixtureId: string;
  readonly skillRunnerId?: string;
  readonly skillRunnerStatus?: string;
  readonly sandboxDecision: string;
  readonly allowlistDecision: string;
  readonly confirmationDecision: string;
  readonly evidenceBundle: BrowserEvidenceBundle;
  readonly replayReadiness: BrowserReplayReadiness;
  readonly redactions: readonly string[];
  readonly warnings: readonly string[];
  readonly nextAction: string;
  readonly executed: boolean;
  readonly rawContent: "excluded";
  readonly providerCall: "none";
  readonly modelCall: "none";
}

export function createBrowserExecutionReceipt(input: {
  readonly request: BrowserExecutionRequest;
  readonly policy: BrowserExecutionPolicyDecision;
  readonly executorResult: BrowserExecutorResult;
  readonly skillRunnerMetadata?: BrowserSkillRunnerMetadata;
  readonly skillRunnerReadiness?: BrowserSkillRunnerReadiness;
  readonly now?: () => string;
}): BrowserExecutionReceipt {
  const evidenceBundle = createBrowserEvidenceBundle({
    request: input.request,
    executorResult: input.executorResult,
    outputBudgetBytes: numberEvidence(input.executorResult, "output budget bytes"),
  });
  const status = receiptStatus(input.executorResult);
  const runnerId = evidenceValue(input.executorResult, "runner id") ?? input.executorResult.executorKind;
  const runnerSource = evidenceValue(input.executorResult, "runner source") ?? input.executorResult.executorKind;
  const manifestId = evidenceValue(input.executorResult, "manifest id") ?? evidenceValue(input.executorResult, "manifest status") ?? "none";
  const manifestSource = evidenceValue(input.executorResult, "manifest source") ?? evidenceValue(input.executorResult, "runner source") ?? "none";
  const fixtureId = evidenceValue(input.executorResult, "fixture id") ?? evidenceBundle.safeOriginOrFixtureId;
  const sandboxDecision = evidenceValue(input.executorResult, "sandbox decision") ?? input.policy.status;
  const allowlistDecision = evidenceValue(input.executorResult, "allowlist decision") ?? "unknown";
  const confirmationDecision = evidenceValue(input.executorResult, "confirmation decision") ?? "unknown";
  const replayReadiness = classifyBrowserReplayReadiness({
    requestId: input.request.requestId,
    actionKind: input.request.actionKind,
    mode: input.request.mode,
    executorKind: input.executorResult.executorKind,
    receiptStatus: status,
    executed: input.executorResult.executed,
    evidenceBundle,
    sandboxDecision,
    allowlistDecision,
    confirmationDecision,
    runnerId,
    manifestId,
    skillRunnerRequired: input.skillRunnerReadiness?.status === "future-execution-required",
  });
  return {
    receiptId: deterministicBrowserExecutionReceiptId(input.request.requestId, status, input.executorResult.executorKind),
    version: "browser-execution-receipt/v1",
    createdAt: input.now?.() ?? "2026-05-17T00:00:00.000Z",
    status,
    source: receiptSource(input.executorResult),
    visibility: "user-visible",
    actionKind: input.request.actionKind,
    executionMode: input.request.mode,
    runnerId: sanitizeBrowserText(runnerId, 120),
    runnerSource: sanitizeBrowserText(runnerSource, 120),
    manifestId: sanitizeBrowserText(manifestId, 120),
    manifestSource: sanitizeBrowserText(manifestSource, 120),
    fixtureId: sanitizeBrowserText(fixtureId, 120),
    skillRunnerId: input.skillRunnerMetadata?.runnerId
      ? sanitizeBrowserText(input.skillRunnerMetadata.runnerId, 120)
      : undefined,
    skillRunnerStatus: input.skillRunnerReadiness?.status,
    sandboxDecision: sanitizeBrowserText(sandboxDecision, 120),
    allowlistDecision: sanitizeBrowserText(allowlistDecision, 120),
    confirmationDecision: sanitizeBrowserText(confirmationDecision, 120),
    evidenceBundle,
    replayReadiness,
    redactions: unique([...evidenceBundle.redactions, ...input.executorResult.evidence.filter((item) => item.label === "redaction").map((item) => item.value)]),
    warnings: unique([...evidenceBundle.warnings, ...input.executorResult.warnings, ...(input.skillRunnerReadiness?.warnings ?? [])]),
    nextAction: replayReadiness.nextAction,
    executed: input.executorResult.executed,
    rawContent: "excluded",
    providerCall: "none",
    modelCall: "none",
  };
}

export function deterministicBrowserExecutionReceiptId(
  requestId: string,
  status: BrowserExecutionReceiptStatus,
  source: BrowserExecutorKind | BrowserExecutionReceiptSource,
): BrowserExecutionReceiptId {
  const normalized = sanitizeBrowserText(`${requestId}:${source}:${status}`, 140)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `browser-receipt:${normalized || "receipt"}`;
}

function receiptStatus(result: BrowserExecutorResult): BrowserExecutionReceiptStatus {
  const runnerStatus = evidenceValue(result, "runner status");
  if (runnerStatus === "timed-out") {
    return "timed-out";
  }
  if (runnerStatus === "invalid-response") {
    return result.warnings.some((warning) => /unsafe/i.test(warning)) ? "unsafe-output" : "invalid-response";
  }
  if (runnerStatus === "unavailable") {
    return "unavailable";
  }
  if (result.error?.code.includes("timed-out")) {
    return "timed-out";
  }
  if (result.error?.code.includes("invalid-response")) {
    return result.warnings.some((warning) => /unsafe/i.test(warning)) ? "unsafe-output" : "invalid-response";
  }
  if (result.error?.code.includes("unavailable")) {
    return "unavailable";
  }
  if (result.status === "executed") {
    return "executed";
  }
  if (result.status === "failed") {
    return "failed";
  }
  return "blocked";
}

function receiptSource(result: BrowserExecutorResult): BrowserExecutionReceiptSource {
  if (result.executorKind === "external-runner") {
    return "external-runner";
  }
  if (result.executorKind === "skill-runner" || evidenceValue(result, "skill execution") === "skill-managed") {
    return "skill-managed";
  }
  if (result.executorKind === "local-fixture" || result.executorKind === "explicit-local") {
    return "local-fixture";
  }
  if (result.executorKind === "fake-test") {
    return "fake-test";
  }
  if (result.executorKind === "playwright-local") {
    return result.executed ? "local-fixture" : "playwright-local-unavailable";
  }
  return "dry-run";
}

function evidenceValue(result: BrowserExecutorResult, label: string): string | undefined {
  return result.evidence.find((item) => item.label === label)?.value;
}

function numberEvidence(result: BrowserExecutorResult, label: string): number | undefined {
  const value = evidenceValue(result, label);
  return value ? Number.parseInt(value, 10) : undefined;
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
