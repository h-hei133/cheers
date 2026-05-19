import type { BrowserObservation } from "../core/context/browserObs.js";
import {
  formatBrowserTxnResult,
  type BrowserTxnResult,
} from "../core/context/browserTxnEvidence.js";
import {
  projectRuntimeCodingOutcome,
  type RuntimeOutcomeProjection,
} from "./runtimeOutcomeProjection.js";
import { projectBrowserAgentResultEvidence } from "./flowEvidenceProjection.js";

export interface BrowserToolFailureProjection {
  readonly reason: string;
  readonly reasonCode: string;
}

export function projectBrowserContinuationResult(input: {
  readonly evidence: string[];
  readonly continuationSummary: string;
}): RuntimeOutcomeProjection {
  return projectRuntimeCodingOutcome({
    taskKind: "browser",
    changedFiles: [],
    failedFiles: [],
    patches: [],
    verifiedFiles: [],
    unverifiedFiles: [],
    verification: {
      status: "passed",
      selectionScope: "none",
      selectionSource: "not-requested",
    },
    repairNotes: ["browser continuation evidence summarized"],
    evidence: input.evidence,
    taskVerdict: "satisfied",
    taskReasons: [],
    userFacingOutput: [
      "Browser evidence from prior session",
      `- Summary: ${input.continuationSummary}`,
      "- Raw DOM: excluded",
    ].join("\n"),
  });
}

export function projectBrowserTransactionResult(input: {
  readonly evidence: string[];
  readonly transaction: BrowserTxnResult;
}): RuntimeOutcomeProjection {
  const failed = input.transaction.status !== "success";
  return projectRuntimeCodingOutcome({
    taskKind: "browser",
    changedFiles: [],
    failedFiles: failed
      ? [{ path: "(browser)", reason: input.transaction.finalSummary }]
      : [],
    patches: [],
    verifiedFiles: [],
    unverifiedFiles: [],
    verification: failed
      ? {
          status: "blocked",
          reason: input.transaction.finalSummary,
          selectionScope: "focused",
          selectionSource: "auto-from-changes",
          blockerKind: "unknown",
          nextAction:
            input.transaction.nextActions[0] ??
            "Retry only within controlled local browser policy.",
        }
      : {
          status: "passed",
          selectionScope: "focused",
          selectionSource: "auto-from-changes",
        },
    repairNotes:
      input.transaction.repairStatus === "not-needed"
        ? ["browser transaction completed without repair"]
        : [`browser transaction repair ${input.transaction.repairStatus}`],
    evidence: projectBrowserAgentResultEvidence({
      evidence: input.evidence,
      failed,
      reasonCode: input.transaction.reasonCode,
    }),
    taskVerdict: failed ? "insufficient-evidence" : "satisfied",
    taskReasons: failed ? [input.transaction.finalSummary] : [],
    userFacingOutput: formatBrowserTxnResult(input.transaction),
  });
}

export function projectBrowserObservationResult(input: {
  readonly evidence: string[];
  readonly firstFailure?: BrowserToolFailureProjection;
  readonly finalObservation?: BrowserObservation;
}): RuntimeOutcomeProjection {
  const failed = Boolean(input.firstFailure);
  const reasonCode =
    input.firstFailure?.reasonCode ??
    input.finalObservation?.reasonCode ??
    "ready";
  const output = failed
    ? [
        "Browser task stopped",
        `- ReasonCode: ${reasonCode}`,
        `- Reason: ${input.firstFailure?.reason ?? "Browser tool failed"}`,
        `- Cleanup: ${input.finalObservation?.cleanupStatus ?? "not-started"}`,
        `- Next: ${input.finalObservation?.nextActions.join("; ") ?? "Retry only within controlled local browser policy."}`,
        "- Raw DOM: excluded",
      ].join("\n")
    : [
        "Browser task completed",
        `- Operation: ${input.finalObservation?.operation ?? "none"}`,
        `- Summary: ${input.finalObservation?.visibleTextSummary ?? "No browser observation returned."}`,
        `- Cleanup: ${input.finalObservation?.cleanupStatus ?? "not-started"}`,
        `- EvidenceId: ${input.finalObservation?.evidenceId ?? "none"}`,
        "- Raw DOM: excluded",
      ].join("\n");

  return projectRuntimeCodingOutcome({
    taskKind: "browser",
    changedFiles: [],
    failedFiles: failed
      ? [
          {
            path: "(browser)",
            reason: input.firstFailure?.reason ?? "Browser tool failed",
          },
        ]
      : [],
    patches: [],
    verifiedFiles: [],
    unverifiedFiles: [],
    verification: failed
      ? {
          status: "blocked",
          reason: input.firstFailure?.reason,
          selectionScope: "focused",
          selectionSource: "auto-from-changes",
          blockerKind: "unknown",
          nextAction:
            input.finalObservation?.nextActions[0] ??
            "Retry only within controlled local browser policy.",
        }
      : {
          status: "passed",
          selectionScope: "focused",
          selectionSource: "auto-from-changes",
        },
    repairNotes: failed
      ? [`browser stopped: ${reasonCode}`]
      : ["browser observation summarized without raw DOM"],
    evidence: projectBrowserAgentResultEvidence({
      evidence: input.evidence,
      failed,
      reasonCode,
    }),
    taskVerdict: failed ? "insufficient-evidence" : "satisfied",
    taskReasons: failed
      ? [input.firstFailure?.reason ?? "Browser tool failed"]
      : [],
    userFacingOutput: output,
  });
}
