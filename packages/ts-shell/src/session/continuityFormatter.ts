import type { SessionContinuitySnapshot } from "./sessionContinuityTypes.js";

export function formatPromptContinuityContext(
  snapshot: SessionContinuitySnapshot,
): string {
  const lines: string[] = ["Session continuity context:"];

  if (snapshot.lastTaskKind) {
    lines.push(`- last-task-kind: ${snapshot.lastTaskKind}`);
  }
  if (snapshot.lastGroundedDeliverableMode) {
    lines.push(
      `- last-grounded-deliverable-mode: ${snapshot.lastGroundedDeliverableMode}`,
    );
  }
  if (snapshot.lastReadDeliveredLines !== undefined) {
    lines.push(`- last-read-delivered-lines: ${snapshot.lastReadDeliveredLines}`);
  }
  if (snapshot.lastReadWindowStart !== undefined) {
    lines.push(`- last-read-window-start: ${snapshot.lastReadWindowStart}`);
  }
  if (snapshot.lastReadWindowEnd !== undefined) {
    lines.push(`- last-read-window-end: ${snapshot.lastReadWindowEnd}`);
  }
  if (snapshot.lastReadWindowSize !== undefined) {
    lines.push(`- last-read-window-size: ${snapshot.lastReadWindowSize}`);
  }
  if (snapshot.lastReadFragmentStart !== undefined) {
    lines.push(
      `- last-read-fragment-start: ${snapshot.lastReadFragmentStart}`,
    );
  }
  if (snapshot.lastReadFragmentEnd !== undefined) {
    lines.push(`- last-read-fragment-end: ${snapshot.lastReadFragmentEnd}`);
  }
  if ((snapshot.lastReadFragmentLineIndexes?.length ?? 0) > 0) {
    const indexCount = snapshot.lastReadFragmentLineIndexes?.length ?? 0;
    lines.push(`- last-read-fragment-line-index-count: ${indexCount}`);
    if (indexCount <= 128) {
      lines.push(
        `- last-read-fragment-line-indexes: ${snapshot.lastReadFragmentLineIndexes?.join(",")}`,
      );
    }
  }
  if ((snapshot.lastReadFragmentRanges?.length ?? 0) > 0) {
    const rangeCount = snapshot.lastReadFragmentRanges?.length ?? 0;
    lines.push(`- last-read-fragment-range-count: ${rangeCount}`);
    lines.push(
      `- last-read-fragment-ranges: ${snapshot.lastReadFragmentRanges?.join(";")}`,
    );
  }
  if (snapshot.lastReadFragmentSourceWindowStart !== undefined) {
    lines.push(
      `- last-read-fragment-source-window-start: ${snapshot.lastReadFragmentSourceWindowStart}`,
    );
  }
  if (snapshot.lastReadFragmentSourceWindowEnd !== undefined) {
    lines.push(
      `- last-read-fragment-source-window-end: ${snapshot.lastReadFragmentSourceWindowEnd}`,
    );
  }
  if (snapshot.lastReadFilter) {
    lines.push(`- last-read-filter: ${snapshot.lastReadFilter}`);
  }
  if (snapshot.lastReadFragmentFingerprint) {
    lines.push(
      `- last-read-fragment-fingerprint: ${snapshot.lastReadFragmentFingerprint}`,
    );
  }
  if (snapshot.lastStagedRepairStepCount !== undefined) {
    lines.push(
      `- last-staged-repair-steps: ${snapshot.lastStagedRepairStepCount}`,
    );
  }
  if (snapshot.lastStagedRepairCompletedStep !== undefined) {
    lines.push(
      `- last-staged-repair-completed-step: ${snapshot.lastStagedRepairCompletedStep}`,
    );
  }
  if (snapshot.lastStagedRepairBlockedStep !== undefined) {
    lines.push(
      `- last-staged-repair-blocked-step: ${snapshot.lastStagedRepairBlockedStep}`,
    );
  }
  if (snapshot.lastStagedRepairNextStep !== undefined) {
    lines.push(`- last-staged-repair-next-step: ${snapshot.lastStagedRepairNextStep}`);
  }
  if (snapshot.lastAnswerDefect) {
    lines.push(`- last-answer-defect: ${compactText(snapshot.lastAnswerDefect, 120)}`);
  }
  if (snapshot.lastActionHandoffSummary) {
    lines.push(
      `- last-action-handoff-summary: ${compactText(snapshot.lastActionHandoffSummary, 180)}`,
    );
  }
  if (snapshot.lastSeedInfluenceHandoffSummary) {
    lines.push(
      `- last-seed-influence-handoff-summary: ${compactText(snapshot.lastSeedInfluenceHandoffSummary, 180)}`,
    );
  }
  if (snapshot.lastWriterStarted !== undefined) {
    lines.push(
      `- last-writer-started: ${snapshot.lastWriterStarted ? "yes" : "no"}`,
    );
  }
  if (snapshot.lastWriteEffect) {
    lines.push(`- last-write-effect: ${snapshot.lastWriteEffect}`);
  }
  if (snapshot.lastWriteRequiresUserInspection !== undefined) {
    lines.push(
      `- last-write-requires-user-inspection: ${snapshot.lastWriteRequiresUserInspection ? "yes" : "no"}`,
    );
  }
  if (snapshot.lastWriteEffectTarget) {
    lines.push(`- last-write-effect-target: ${snapshot.lastWriteEffectTarget}`);
  }
  if (snapshot.lastFailureHandoffDiagnostic) {
    lines.push(
      `- last-failure-handoff-diagnostic: ${compactText(snapshot.lastFailureHandoffDiagnostic, 220)}`,
    );
  }
  if (snapshot.lastSuccessHandoffDiagnostic) {
    lines.push(
      `- last-success-handoff-diagnostic: ${compactText(snapshot.lastSuccessHandoffDiagnostic, 220)}`,
    );
  }
  if (snapshot.lastTerminalClassification || snapshot.lastTerminalReason) {
    lines.push(
      `- last-terminal: ${snapshot.lastTerminalClassification ?? "unknown"} (${snapshot.lastTerminalReason ?? "unknown"})`,
    );
  }
  if (snapshot.lastFailure) {
    lines.push(`- last-failure: ${compactText(snapshot.lastFailure)}`);
  }
  if (snapshot.recentChangedFiles.length > 0) {
    lines.push(`- recent-changed-files: ${snapshot.recentChangedFiles.join(", ")}`);
  }
  const candidateTargetFiles = Array.from(
    new Set([
      ...snapshot.recentTargetFiles,
      ...snapshot.recentChangedFiles,
      ...snapshot.recentVerifiedFiles,
      ...snapshot.recentFailedFiles.map((entry) => entry.path),
    ]),
  );
  if (candidateTargetFiles.length > 0) {
    lines.push(`- recent-target-files: ${candidateTargetFiles.join(", ")}`);
  }
  if (snapshot.recentVerifiedFiles.length > 0) {
    lines.push(`- recent-verified-files: ${snapshot.recentVerifiedFiles.join(", ")}`);
  }
  if (snapshot.recentFailedFiles.length > 0) {
    lines.push(
      `- recent-failed-files: ${snapshot.recentFailedFiles
        .map((entry) => `${entry.path} (${entry.reason})`)
        .join(", ")}`,
    );
  }
  if (snapshot.lastVerificationStatus) {
    lines.push(`- last-verification-status: ${snapshot.lastVerificationStatus}`);
    if (snapshot.lastVerificationCommand) {
      lines.push(`- last-verification-command: ${snapshot.lastVerificationCommand}`);
    }
    if (snapshot.lastVerificationReason) {
      lines.push(
        `- last-verification-reason: ${compactText(snapshot.lastVerificationReason)}`,
      );
    }
    if (snapshot.lastVerificationBlockerKind) {
      lines.push(
        `- last-verification-blocker-kind: ${snapshot.lastVerificationBlockerKind}`,
      );
    }
    if (snapshot.lastVerificationNextAction) {
      lines.push(
        `- last-verification-next-action: ${compactText(snapshot.lastVerificationNextAction)}`,
      );
    }
    if (snapshot.lastVerificationResumeEligible !== undefined) {
      lines.push(
        `- last-verification-resume-eligible: ${snapshot.lastVerificationResumeEligible ? "yes" : "no"}`,
      );
    }
  }
  if (snapshot.lastApprovalDecision) {
    lines.push(`- last-approval-decision: ${snapshot.lastApprovalDecision}`);
    if (snapshot.lastApprovalDecisionSource) {
      lines.push(
        `- last-approval-decision-source: ${snapshot.lastApprovalDecisionSource}`,
      );
    }
    if (snapshot.lastApprovalPersistent !== undefined) {
      lines.push(
        `- last-approval-persistent: ${snapshot.lastApprovalPersistent ? "yes" : "no"}`,
      );
    }
    if (snapshot.lastApprovalCacheEffect) {
      lines.push(`- last-approval-cache-effect: ${snapshot.lastApprovalCacheEffect}`);
    }
    if (snapshot.lastApprovalProjectRoot) {
      lines.push(`- last-approval-project-root: ${snapshot.lastApprovalProjectRoot}`);
    }
    if (snapshot.lastApprovalCacheKey) {
      lines.push(`- last-approval-cache-key: ${snapshot.lastApprovalCacheKey}`);
    }
    if (snapshot.lastApprovalScope) {
      lines.push(`- last-approval-scope: ${snapshot.lastApprovalScope}`);
    }
    if (snapshot.lastApprovalLineage) {
      lines.push(`- last-approval-lineage: ${snapshot.lastApprovalLineage}`);
    }
    if (snapshot.lastApprovalChannel) {
      lines.push(`- last-approval-channel: ${snapshot.lastApprovalChannel}`);
    }
    if (snapshot.lastApprovalInputKey) {
      lines.push(`- last-approval-input-key: ${snapshot.lastApprovalInputKey}`);
    }
    if (snapshot.lastApprovalStopReason) {
      lines.push(
        `- last-approval-stop-reason: ${compactText(snapshot.lastApprovalStopReason)}`,
      );
    }
    if (snapshot.lastApprovalRecordedAt) {
      lines.push(`- last-approval-recorded-at: ${snapshot.lastApprovalRecordedAt}`);
    }
  }
  if (snapshot.lastApprovalProvenanceKind) {
    lines.push(`- last-approval-provenance-kind: ${snapshot.lastApprovalProvenanceKind}`);
    if (snapshot.lastApprovalProvenanceSource) {
      lines.push(
        `- last-approval-provenance-source: ${snapshot.lastApprovalProvenanceSource}`,
      );
    }
    if (snapshot.lastApprovalProvenanceToolName) {
      lines.push(
        `- last-approval-provenance-tool: ${snapshot.lastApprovalProvenanceToolName}`,
      );
    }
    if (snapshot.lastApprovalProvenanceTaskId) {
      lines.push(
        `- last-approval-provenance-task-id: ${snapshot.lastApprovalProvenanceTaskId}`,
      );
    }
  }
  if (snapshot.lastToolExecutionProvenanceKind) {
    lines.push(
      `- last-tool-execution-provenance-kind: ${snapshot.lastToolExecutionProvenanceKind}`,
    );
    if (snapshot.lastToolExecutionProvenanceSource) {
      lines.push(
        `- last-tool-execution-provenance-source: ${snapshot.lastToolExecutionProvenanceSource}`,
      );
    }
    if (snapshot.lastToolExecutionProvenanceToolName) {
      lines.push(
        `- last-tool-execution-provenance-tool: ${snapshot.lastToolExecutionProvenanceToolName}`,
      );
    }
    if (snapshot.lastToolExecutionProvenanceTaskId) {
      lines.push(
        `- last-tool-execution-provenance-task-id: ${snapshot.lastToolExecutionProvenanceTaskId}`,
      );
    }
    if (snapshot.lastToolExecutionFailureBoundary) {
      lines.push(
        `- last-tool-execution-failure-boundary: ${snapshot.lastToolExecutionFailureBoundary}`,
      );
    }
  }
  if (snapshot.lastRequestScopeCacheKey) {
    lines.push(`- last-request-scope-cache-key: ${snapshot.lastRequestScopeCacheKey}`);
  }
  if (snapshot.lastRequestScopeLabel) {
    lines.push(`- last-request-scope-label: ${snapshot.lastRequestScopeLabel}`);
  }
  if (snapshot.lastRequestScopeProjectRoot) {
    lines.push(
      `- last-request-scope-project-root: ${snapshot.lastRequestScopeProjectRoot}`,
    );
  }
  if (snapshot.lastRequestScopeSource) {
    lines.push(`- last-request-scope-source: ${snapshot.lastRequestScopeSource}`);
  }
  if (snapshot.lastPermissionRequestToolName) {
    lines.push(
      `- last-permission-request-tool: ${snapshot.lastPermissionRequestToolName}`,
    );
  }
  if (snapshot.lastPermissionRequestOperation) {
    lines.push(
      `- last-permission-request-operation: ${snapshot.lastPermissionRequestOperation}`,
    );
  }
  if (snapshot.lastPermissionRequestTarget) {
    lines.push(
      `- last-permission-request-target: ${snapshot.lastPermissionRequestTarget}`,
    );
  }
  if (snapshot.lastPermissionRequestProcess) {
    lines.push(
      `- last-permission-request-process: ${snapshot.lastPermissionRequestProcess}`,
    );
  }
  if (snapshot.lastPermissionRequestScopeKey) {
    lines.push(
      `- last-permission-request-scope-key: ${snapshot.lastPermissionRequestScopeKey}`,
    );
  }
  if (snapshot.lastPermissionRequestScopeLabel) {
    lines.push(
      `- last-permission-request-scope-label: ${snapshot.lastPermissionRequestScopeLabel}`,
    );
  }
  if (snapshot.lastPermissionRequestCacheKey) {
    lines.push(
      `- last-permission-request-cache-key: ${snapshot.lastPermissionRequestCacheKey}`,
    );
  }
  if (snapshot.lastPermissionRequestProjectRoot) {
    lines.push(
      `- last-permission-request-project-root: ${snapshot.lastPermissionRequestProjectRoot}`,
    );
  }
  if (snapshot.lastPermissionRequestSource) {
    lines.push(
      `- last-permission-request-source: ${snapshot.lastPermissionRequestSource}`,
    );
  }
  if (snapshot.lastPermissionRequestLineage) {
    lines.push(
      `- last-permission-request-lineage: ${snapshot.lastPermissionRequestLineage}`,
    );
  }
  if (snapshot.lastRepairStatus) {
    lines.push(`- last-repair-status: ${snapshot.lastRepairStatus}`);
    if (snapshot.lastRepairNotes.length > 0) {
      lines.push(
        `- last-repair-notes: ${snapshot.lastRepairNotes
          .map((note) => compactText(note, 120))
          .join(" | ")}`,
      );
    }
  }
  if (snapshot.lastContinuationStatus) {
    lines.push(`- last-continuation-status: ${snapshot.lastContinuationStatus}`);
    if (snapshot.lastContinuationEvidence.length > 0) {
      lines.push(
        `- last-continuation-evidence: ${snapshot.lastContinuationEvidence
          .map((entry) => compactText(entry, 120))
          .join(" | ")}`,
      );
    }
  }
  if (snapshot.lastTaskSatisfactionVerdict) {
    lines.push(
      `- last-task-satisfaction: ${snapshot.lastTaskSatisfactionVerdict}`,
    );
    if (snapshot.lastTaskSatisfactionReasons.length > 0) {
      lines.push(
        `- last-task-satisfaction-reasons: ${snapshot.lastTaskSatisfactionReasons
          .map((reason) => compactText(reason, 120))
          .join(" | ")}`,
      );
    }
  }
  if (snapshot.unresolvedItems.length > 0) {
    lines.push(`- unresolved-items: ${snapshot.unresolvedItems.join(" | ")}`);
  }
  lines.push(
    "- instruction: use this continuity context to continue the same task; do not restart from scratch.",
  );

  return lines.join("\n");
}

function compactText(input: string, max: number = 220): string {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max)}...`;
}
