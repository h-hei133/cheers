import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserRuntimeExecutorResult } from "./browser/runtime/core/executor.js";

export type BrowserObservationStatus = "success" | "stopped" | "failed";

export interface BrowserObservation {
  readonly status: BrowserObservationStatus;
  readonly operation: string;
  readonly controlledTarget: string;
  readonly visibleTextSummary: string;
  readonly actionResultSummary: string;
  readonly reasonCode: string;
  readonly cleanupStatus: string;
  readonly redactionStatus: string;
  readonly evidenceId: string;
  readonly nextActions: readonly string[];
  readonly evidence: readonly string[];
}

export function browserObservationFromRuntimeResult(input: {
  readonly toolName: string;
  readonly result: BrowserRuntimeExecutorResult;
}): BrowserObservation {
  const reasonCode = extractEvidenceValue(input.result.evidence, "pw-evidence:failure:") ??
    (input.result.status === "observed" || input.result.status === "acted" ? "ready" : "unknown");
  const cleanupStatus = extractEvidenceValue(input.result.evidence, "pw-evidence:cleanup:") ?? "not-started";
  const observationStatus = input.result.status === "failed"
    ? "failed"
    : input.result.status === "blocked"
      ? "stopped"
      : "success";
  const evidenceId = stableBrowserEvidenceId([
    input.toolName,
    input.result.actionKind,
    input.result.url,
    input.result.renderedText,
    reasonCode,
  ].join("|"));
  const visibleTextSummary = sanitizeBrowserText(input.result.renderedText, 360);
  const actionResultSummary = input.result.actionApplied
    ? `${input.result.actionKind} applied on controlled target`
    : `${input.result.actionKind} returned controlled observation`;

  return {
    status: observationStatus,
    operation: input.result.actionKind,
    controlledTarget: sanitizeBrowserText(input.result.url, 180),
    visibleTextSummary,
    actionResultSummary: sanitizeBrowserText(actionResultSummary, 180),
    reasonCode,
    cleanupStatus,
    redactionStatus: input.result.redactions.length > 0 ? "redacted" : "clean",
    evidenceId,
    nextActions: nextActionsForReason(reasonCode, observationStatus),
    evidence: [
      `browser-observation:evidence-id:${evidenceId}`,
      `browser-observation:operation:${input.result.actionKind}`,
      `browser-observation:status:${observationStatus}`,
      `browser-observation:reason:${reasonCode}`,
      `browser-observation:cleanup:${cleanupStatus}`,
      "browser-observation:raw-dom-excluded",
      "browser-observation:no-secrets",
    ],
  };
}

export function formatBrowserObservation(observation: BrowserObservation): string {
  return [
    "Browser observation",
    `- Outcome: ${observation.status}`,
    `- Operation: ${observation.operation}`,
    `- Target: ${observation.controlledTarget}`,
    `- Summary: ${observation.visibleTextSummary || observation.actionResultSummary}`,
    `- ReasonCode: ${observation.reasonCode}`,
    `- Cleanup: ${observation.cleanupStatus}`,
    `- Redaction: ${observation.redactionStatus}`,
    `- EvidenceId: ${observation.evidenceId}`,
    `- Next: ${observation.nextActions.join("; ") || "none"}`,
  ].join("\n");
}

export function browserObservationFromMetadata(
  metadata: Record<string, unknown> | undefined,
): BrowserObservation | undefined {
  const value = metadata?.browserObservation;
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const candidate = value as BrowserObservation;
  if (
    typeof candidate.status === "string" &&
    typeof candidate.operation === "string" &&
    typeof candidate.evidenceId === "string"
  ) {
    return candidate;
  }
  return undefined;
}

export function browserObservationEvidenceLine(observation: BrowserObservation): string {
  return [
    "browser-agent-observation",
    observation.evidenceId,
    observation.operation,
    observation.status,
    observation.reasonCode,
    observation.cleanupStatus,
    sanitizeBrowserText(observation.visibleTextSummary || observation.actionResultSummary, 160),
  ].join(":");
}

function nextActionsForReason(
  reasonCode: string,
  status: BrowserObservationStatus,
): readonly string[] {
  if (status === "success") {
    return ["Use the summarized browser evidence in the final answer."];
  }
  if (reasonCode === "policy-blocked") {
    return ["Use a controlled local fixture or explicit approved loopback target."];
  }
  if (reasonCode === "runtime-package-missing") {
    return ["Install the workspace Playwright dependency, then retry the controlled browser task."];
  }
  if (reasonCode === "runtime-binary-missing") {
    return ["Install Chromium with Playwright or set a controlled local executable path."];
  }
  if (reasonCode === "action-target-missing") {
    return ["Observe the fixture, choose a visible safe target, then retry the action."];
  }
  if (reasonCode === "action-timeout" || reasonCode === "navigation-timeout") {
    return ["Increase the controlled timeout or use a ready local fixture."];
  }
  return ["Inspect the browser reason code and retry only within controlled local policy."];
}

function extractEvidenceValue(
  evidence: readonly string[],
  prefix: string,
): string | undefined {
  return evidence.find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
}

function stableBrowserEvidenceId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `browser-obs-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
