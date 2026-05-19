import {
  browserObservationEvidenceLine,
  type BrowserObservation,
} from "../core/context/browserObs.js";
import { browserTxnTraceEvidenceLine } from "../core/context/browserTrace.js";
import {
  browserTxnEvidenceLine,
  type BrowserTxnResult,
} from "../core/context/browserTxnEvidence.js";
import type { CodingVerificationSummary } from "./types.js";

export function buildBrowserAgentBaseEvidence(input: {
  readonly freshnessEvidence: readonly string[];
  readonly planEvidence: readonly string[];
}): string[] {
  return [
    ...input.freshnessEvidence,
    ...input.planEvidence,
    "browser-agent-loop:entered-query-loop",
    "browser-agent-loop:no-raw-dom",
    "browser-agent-loop:no-public-web-default",
  ];
}

export function projectBrowserContinuationEvidence(
  evidence: readonly string[],
): string[] {
  return [...evidence, "browser-agent-loop:continued-from-prior-evidence"];
}

export function projectBrowserTransactionEvidence(input: {
  readonly evidence: readonly string[];
  readonly transaction: BrowserTxnResult;
}): string[] {
  return [
    ...input.evidence,
    browserTxnEvidenceLine(input.transaction),
    browserTxnTraceEvidenceLine(input.transaction.trace),
    [
      "browser-agent-observation",
      input.transaction.evidenceId,
      "transaction",
      input.transaction.status,
      input.transaction.reasonCode,
      input.transaction.cleanupStatus,
      input.transaction.finalSummary,
    ].join(":"),
    ...input.transaction.evidence,
  ];
}

export function projectBrowserObservationEvidence(
  observation: BrowserObservation,
): string[] {
  return [
    browserObservationEvidenceLine(observation),
    ...observation.evidence,
  ];
}

export function projectBrowserAgentResultEvidence(input: {
  readonly evidence: readonly string[];
  readonly failed: boolean;
  readonly reasonCode: string;
}): string[] {
  return [
    ...input.evidence,
    `browser-agent-result:${input.failed ? "stopped" : "success"}`,
    `browser-agent-reason:${input.reasonCode}`,
  ];
}

export function projectVerificationEvidence(input: {
  readonly verification: CodingVerificationSummary;
  readonly targetPath?: string;
  readonly workspaceRoot: string;
  readonly verifyLikeCommand: boolean;
}): string[] {
  const evidence: string[] = [];
  if (input.verification.command && input.verifyLikeCommand) {
    evidence.push(`verify-command-hint:${input.verification.command}`);
    evidence.push(`verify-cwd-hint:${input.workspaceRoot}`);
  }
  if (input.targetPath) {
    evidence.push(`verify-target-hint:${input.targetPath}`);
  }
  if (input.verification.blockerKind) {
    evidence.push(`verify-blocker-kind:${input.verification.blockerKind}`);
  }
  if (input.verification.nextAction) {
    evidence.push(
      `verify-next-action:${truncate(
        input.verification.nextAction.replace(/\s+/g, " "),
        200,
      )}`,
    );
  }
  if (input.verification.status === "blocked") {
    const resumeEligible =
      input.verification.blockerKind === "approval-denied" &&
      Boolean(input.verification.command?.trim());
    evidence.push(
      `verify-resume-eligible:${resumeEligible ? "true" : "false"}`,
    );
  }
  return evidence;
}

function truncate(value: string, maxLength = 220): string {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}
