import type { CompactFutureTurnCandidateContext } from "./compactFutureTurnAdapter.js";

export interface CompactInjectedContextFormatterOptions {
  readonly mergedCompactSurvivorFacts?: readonly string[];
  readonly qualityWarnings?: readonly string[];
}

export function formatCompactInjectedContext(
  candidate: CompactFutureTurnCandidateContext,
  options: CompactInjectedContextFormatterOptions = {},
): string {
  const facts = candidate.structuredFacts;
  return [
    "<compact_v2_injected_context>",
    `Checkpoint: ${candidate.checkpointId}`,
    `Injection: ${candidate.injectionStatus}; provider injection: ${candidate.providerInjectionStatus}`,
    "",
    "Task / route",
    `- Objective: ${facts.taskRoute.objective ?? "not recorded"}`,
    `- Route: ${[facts.taskRoute.routeId, facts.taskRoute.routeName].filter(Boolean).join(" ") || "not recorded"}`,
    `- Current phase: ${facts.taskRoute.currentPhase ?? "not recorded"}`,
    `- Next action: ${facts.nextAction ?? "not recorded"}`,
    "",
    "Edit capability",
    `- Closeout status: ${facts.editCapability.closeoutStatus ?? "not recorded"}`,
    list("Default supported", facts.editCapability.supportedDefault),
    list("Non-default supported", facts.editCapability.supportedNonDefault),
    list("Explicit opt-in only", facts.editCapability.explicitOptInOnly),
    list(
      "Blocked by design",
      facts.editCapability.blockedByDesign.map(
        (entry) => `${entry.id}: ${entry.reason}`,
      ),
    ),
    "- Automatic recovery: not enabled",
    "- Atomic rollback: not available",
    "",
    "Mutation evidence",
    list("Planned files", facts.mutationEvidence.plannedFiles),
    list("Changed files", facts.mutationEvidence.changedFiles),
    list(
      "Failed files",
      facts.mutationEvidence.failedFiles.map(
        (entry) => `${entry.path}: ${entry.reason}`,
      ),
    ),
    `- Post-write verification: ${facts.mutationEvidence.postWriteVerification ?? "not recorded"}`,
    `- Writer effect: ${facts.mutationEvidence.writeEffect ?? "not recorded"}`,
    "",
    "Recovery / restore",
    `- Restore available: ${facts.recoveryRestoreReferences.restoreAvailable ? "yes" : "no"}`,
    `- Restore preview available: ${facts.recoveryRestoreReferences.restorePreviewAvailable ? "yes" : "no"}`,
    "- Restore execute: explicit-only",
    list(
      "Recovery authority references",
      facts.recoveryRestoreReferences.recoveryAuthorityReferences,
    ),
    list("Restorable files", facts.recoveryRestoreReferences.restorableFiles),
    list(
      "Blocked restore files",
      facts.recoveryRestoreReferences.blockedFiles.map(
        (entry) => `${entry.path}: ${entry.reason}`,
      ),
    ),
    "- Recovery executed: false",
    "",
    "Validation",
    list("Tests run", facts.validationStatus.testsRun),
    list(
      "Verifier status",
      facts.validationStatus.verifierStatus.map(
        (entry) => `${entry.command}: ${entry.status}`,
      ),
    ),
    `- Build: ${facts.validationStatus.buildStatus ?? "not recorded"}`,
    `- Result contract: ${facts.validationStatus.resultContractStatus ?? "not recorded"}`,
    "",
    "Constraints",
    list("Constraints / forbidden scope", facts.constraints),
    "",
    "Merged compact survivor facts",
    list(
      "Stable survivor facts",
      options.mergedCompactSurvivorFacts ?? [],
    ),
    "",
    "Redactions / warnings",
    list(
      "Redactions",
      candidate.redactions.map((entry) => `${entry.inputField}: ${entry.reason}`),
    ),
    list(
      "Warnings",
      [
        ...candidate.warnings.map((entry) => `${entry.id}: ${entry.message}`),
        ...(options.qualityWarnings ?? []),
      ],
    ),
    "",
    "Safety",
    "- Raw original content, raw recovery content, secrets, provider credentials, and hidden reasoning are excluded.",
    "- This context does not grant restore execution, automatic recovery, atomic rollback, memory write, or persistence.",
    "</compact_v2_injected_context>",
  ].join("\n");
}

function list(label: string, values: readonly string[]): string {
  if (values.length === 0) {
    return `- ${label}: none recorded`;
  }
  return [`- ${label}:`, ...values.map((value) => `  - ${value}`)].join("\n");
}
