import {
  deriveActionableBlockerContract,
  projectActionableBlockerTerminalDetail,
  type ActionableBlockerKind,
} from "../core/query/actionableBlockerModule.js";
import type {
  CodingResultSummary,
  TerminalClassification,
} from "../orchestration/types.js";
import { deriveActionableFailureContinuity } from "./actionableFailureContinuity.js";

export interface SessionResultParityProjection {
  readonly terminalClassification: TerminalClassification;
  readonly blockerKind?: ActionableBlockerKind | string;
  readonly reason?: string;
  readonly doNext?: string;
  readonly capabilityArea?: string;
  readonly mutationAuthority?: "not-granted";
  readonly redactionStatus?: "raw-content-excluded" | "redacted-and-budgeted";
  readonly suggestedReads?: string;
  readonly evidenceMarkers: readonly string[];
}

export function projectSessionResultParity(input: {
  readonly terminalClassification: TerminalClassification;
  readonly stopReason?: string;
  readonly codingResult?: CodingResultSummary;
}): SessionResultParityProjection {
  const contract = deriveActionableBlockerContract({
    stopReason: input.stopReason,
    codingResult: input.codingResult,
  });
  const terminalDetail = contract
    ? projectActionableBlockerTerminalDetail(contract)
    : undefined;
  const continuity = deriveActionableFailureContinuity(input.codingResult);
  const evidence = collectEvidence(input.codingResult);
  const reason = selectSafeReason(input.stopReason, input.codingResult);
  const doNext =
    normalizeText(input.codingResult?.verification.nextAction) ??
    terminalDetail?.doNext ??
    continuity?.nextAction;
  const capabilityArea = projectCapabilityArea(evidence);
  const redactionStatus = projectRedactionStatus(evidence);
  const suggestedReads = extractSuggestedReads(evidence);

  return {
    terminalClassification: input.terminalClassification,
    ...(terminalDetail?.kind ?? continuity?.blockerKind
      ? { blockerKind: terminalDetail?.kind ?? continuity?.blockerKind }
      : {}),
    ...(reason ? { reason } : {}),
    ...(doNext ? { doNext } : {}),
    ...(capabilityArea ? { capabilityArea } : {}),
    ...(evidence.some((entry) => /mutationAuthority[:=]not-granted|mutation-authority:not-granted/i.test(entry))
      ? { mutationAuthority: "not-granted" as const }
      : {}),
    ...(redactionStatus ? { redactionStatus } : {}),
    ...(suggestedReads ? { suggestedReads } : {}),
    evidenceMarkers: evidence.filter(isParityEvidenceMarker).slice(0, 12),
  };
}

function selectSafeReason(
  stopReason: string | undefined,
  codingResult: CodingResultSummary | undefined,
): string | undefined {
  return (
    normalizeText(codingResult?.verification.reason) ??
    normalizeText(codingResult?.failedFiles.find((entry) => entry.reason.trim())?.reason) ??
    normalizeText(codingResult?.taskSatisfaction.reasons.find((entry) => entry.trim())) ??
    normalizeText(codingResult?.failureBoundary) ??
    normalizeText(stopReason)
  );
}

function collectEvidence(
  codingResult: CodingResultSummary | undefined,
): readonly string[] {
  if (!codingResult) {
    return [];
  }
  return [
    ...codingResult.evidence,
    ...codingResult.continuation.evidence,
    ...codingResult.taskSatisfaction.observedEvidence,
  ];
}

function projectCapabilityArea(evidence: readonly string[]): string | undefined {
  if (evidence.some((entry) => entry.startsWith("agent-plan"))) {
    return "agent-loop";
  }
  if (
    evidence.some((entry) =>
      /^(task-intent|task-read-plan|analysis-brief|task-lifecycle|task-execution-plan|task-lifecycle-trace)/.test(entry),
    )
  ) {
    return "agent-loop";
  }
  if (
    evidence.some(
      (entry) =>
        entry.startsWith("context-packet") ||
        entry.startsWith("context-plan") ||
        entry.startsWith("context-graph") ||
        entry.startsWith("code-graph") ||
        entry.startsWith("test-impact") ||
        entry.startsWith("plan-quality") ||
        entry.startsWith("harness-trace") ||
        entry.startsWith("harness-scorecard"),
    )
  ) {
    return "workspace-file-context";
  }
  if (
    evidence.some((entry) =>
      /edit|proposal|hunk-set|target-set|rollback|recovery|verification-command/.test(entry),
    )
  ) {
    return "edit-patch";
  }
  if (evidence.some((entry) => entry.includes("approval-denied"))) {
    return "permission-policy";
  }
  return undefined;
}

function projectRedactionStatus(
  evidence: readonly string[],
): SessionResultParityProjection["redactionStatus"] | undefined {
  if (evidence.some((entry) => entry.includes("redacted-and-budgeted"))) {
    return "redacted-and-budgeted";
  }
  if (
    evidence.some(
      (entry) =>
        entry.includes("raw-content-excluded") ||
        entry.includes("raw-full-content-excluded"),
    )
  ) {
    return "raw-content-excluded";
  }
  return undefined;
}

function extractSuggestedReads(evidence: readonly string[]): string | undefined {
  for (const entry of evidence) {
    const match = entry.match(/\bsuggestedReads[=:]([^; ]+)/);
    if (match?.[1]) {
      return match[1];
    }
  }
  return undefined;
}

function isParityEvidenceMarker(entry: string): boolean {
  return /^(?:actionable-blocker-kind|verify-blocker-kind|context-packet|context-plan|context-graph|code-graph|task-intent|task-read-plan|analysis-brief|task-lifecycle|task-execution-plan|test-impact|plan-quality|plan-quality-gate|harness-trace|harness-scorecard|harness-failure|agent-plan|generated-edit|provider-edit|context-aware-provider|edit-proposal|proposal-hunk-set|edit-repair|verification-command|verification-repair|target-set-edit|edit-recovery)/.test(
    entry,
  );
}

function normalizeText(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? normalized : undefined;
}
