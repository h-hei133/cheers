import type { CompactFutureTurnCandidateContext } from "../injection/compactFutureTurnAdapter.js";

export type CompactContinuityQualityStatus = "pass" | "warn" | "fail";

export interface CompactContinuityQualityResult {
  readonly qualityStatus: CompactContinuityQualityStatus;
  readonly score: number;
  readonly checklist: readonly {
    readonly id: string;
    readonly status: "pass" | "warn" | "fail";
    readonly message: string;
  }[];
  readonly warnings: readonly {
    readonly id: string;
    readonly message: string;
  }[];
  readonly blockers: readonly {
    readonly id: string;
    readonly message: string;
  }[];
  readonly estimatedSize: number;
  readonly evidence: readonly string[];
}

export interface EvaluateCompactContinuityQualityInput {
  readonly candidate: CompactFutureTurnCandidateContext;
  readonly injectedContext: string;
  readonly maxInjectedContextChars?: number;
  readonly expectMutationEvidence?: boolean;
  readonly expectRecoverySummary?: boolean;
}

export function evaluateCompactContinuityQuality(
  input: EvaluateCompactContinuityQualityInput,
): CompactContinuityQualityResult {
  const facts = input.candidate.structuredFacts;
  const maxChars = input.maxInjectedContextChars ?? 12_000;
  const estimatedSize = input.injectedContext.length;
  const checks = [
    check(Boolean(facts.taskRoute.objective), "hasTaskGoal", "Task goal is present.", "warn"),
    check(Boolean(facts.nextAction), "hasNextAction", "Next action is present."),
    check(
      Boolean(facts.editCapability.closeoutStatus),
      "hasEditCapabilityFacts",
      "Edit capability closeout status is present.",
    ),
    check(
      facts.editCapability.blockedByDesign.length > 0,
      "hasBlockedByDesignFacts",
      "Blocked-by-design edit facts are present.",
    ),
    check(
      !input.expectMutationEvidence ||
        facts.mutationEvidence.plannedFiles.length > 0 ||
        facts.mutationEvidence.changedFiles.length > 0 ||
        facts.mutationEvidence.failedFiles.length > 0,
      "hasMutationEvidence",
      "Mutation evidence is present when expected.",
      "warn",
    ),
    check(
      !input.expectRecoverySummary ||
        facts.recoveryRestoreReferences.restoreAvailable ||
        facts.recoveryRestoreReferences.recoveryAuthorityReferences.length > 0 ||
        facts.recoveryRestoreReferences.restorableFiles.length > 0,
      "hasRecoverySummary",
      "Recovery summary is present when expected.",
      "warn",
    ),
    check(
      facts.validationStatus.testsRun.length > 0 ||
        facts.validationStatus.verifierStatus.length > 0 ||
        Boolean(facts.validationStatus.buildStatus) ||
        Boolean(facts.validationStatus.resultContractStatus),
      "hasValidationEvidence",
      "Validation evidence is present.",
      "warn",
    ),
    check(
      input.candidate.redactions.length > 0 || input.candidate.excludedFacts.length > 0,
      "hasRedactionEvidence",
      "Redaction or exclusion evidence is present.",
      "warn",
    ),
    check(
      !containsRawContent(input.injectedContext),
      "hasNoRawContentLeak",
      "No raw content marker is present.",
    ),
    check(
      !containsSecret(input.injectedContext),
      "hasNoSecretLeak",
      "No secret-looking value is present.",
    ),
    check(
      !claimsAutomaticRecovery(input.injectedContext),
      "hasNoAutomaticRecoveryClaim",
      "Injected context does not claim automatic recovery.",
    ),
    check(
      !claimsAtomicRollback(input.injectedContext),
      "hasNoAtomicRollbackClaim",
      "Injected context does not claim atomic rollback.",
    ),
    check(
      estimatedSize <= maxChars,
      "estimatedSize",
      `Estimated injected context size is ${estimatedSize}/${maxChars} chars.`,
      "warn",
    ),
  ];
  const blockers = checks
    .filter((entry) => entry.status === "fail")
    .map((entry) => ({ id: entry.id, message: entry.message }));
  const warnings = checks
    .filter((entry) => entry.status === "warn")
    .map((entry) => ({ id: entry.id, message: entry.message }));
  const passed = checks.filter((entry) => entry.status === "pass").length;
  const score = Math.round((passed / checks.length) * 100);

  return {
    qualityStatus: blockers.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "pass",
    score,
    checklist: checks,
    warnings,
    blockers,
    estimatedSize,
    evidence: [
      "compact-continuity-quality:checked",
      "compact-continuity-quality:no-provider-call",
      "compact-continuity-quality:no-persistence",
      blockers.length > 0
        ? "compact-continuity-quality:fail"
        : warnings.length > 0
          ? "compact-continuity-quality:warn"
          : "compact-continuity-quality:pass",
    ],
  };
}

function check(
  passed: boolean,
  id: string,
  message: string,
  missingSeverity: "warn" | "fail" = "fail",
): CompactContinuityQualityResult["checklist"][number] {
  return {
    id,
    status: passed ? "pass" : missingSeverity,
    message,
  };
}

function containsRawContent(value: string): boolean {
  return /\bRAW_[A-Z0-9_]+\b/.test(value);
}

function containsSecret(value: string): boolean {
  return /\bsk-[A-Za-z0-9_-]{8,}\b/.test(value);
}

function claimsAutomaticRecovery(value: string): boolean {
  return /automatic recovery:\s*(enabled|available|yes|true)/i.test(value);
}

function claimsAtomicRollback(value: string): boolean {
  return /atomic rollback:\s*(enabled|available|yes|true)/i.test(value);
}
