import type { ContinuityStateLike } from "../../orchestration/runtimeHandoffProjection.js";

export interface WorkflowTurnContinuationFacts {
  readonly seedActionKind?: string;
  readonly hasActionResultSeed: boolean;
  readonly seedWasReadLike: boolean;
  readonly lastTaskWasReadLike: boolean;
  readonly lastTaskWasMutationLike: boolean;
  readonly seedVerificationStatus?: string;
  readonly diagnosticVerifyStatus?: string;
  readonly diagnosticHasVerifySignal: boolean;
  readonly pendingAction?: string;
  readonly proofGap: readonly string[];
  readonly nextAction?: string;
}

export function deriveWorkflowTurnContinuationFacts(input: {
  readonly continuity: ContinuityStateLike;
  readonly diagnosticHandoffEvidence?: {
    readonly command?: string;
    readonly status?: string;
  };
}): WorkflowTurnContinuationFacts {
  const seedActionKind = input.continuity.lastActionResultSeed?.actionKind;
  const hasActionResultSeed = Boolean(input.continuity.lastActionResultSeed);
  const seedWasReadLike =
    seedActionKind === "read-file" ||
    seedActionKind === "repo-explain" ||
    seedActionKind === "inspect-files";
  const lastTaskWasReadLike =
    input.continuity.lastTaskKind === "read-file" ||
    input.continuity.lastTaskKind === "repo-explain" ||
    input.continuity.lastTaskKind === "inspect-files" ||
    seedWasReadLike;
  const lastTaskWasMutationLike =
    input.continuity.lastTaskKind === "edit-file" ||
    input.continuity.lastTaskKind === "write-file" ||
    input.continuity.lastMutationVerificationLineage?.actionKind ===
      "edit-file" ||
    input.continuity.lastMutationVerificationLineage?.actionKind ===
      "write-file";
  const seedVerificationStatus =
    input.continuity.lastActionResultSeed?.verification?.status
      ?.trim()
      .toLowerCase();
  const diagnosticVerifyStatus = input.diagnosticHandoffEvidence?.status
    ?.trim()
    .toLowerCase();
  const diagnosticHasVerifySignal = Boolean(
    input.diagnosticHandoffEvidence?.command &&
      diagnosticVerifyStatus &&
      diagnosticVerifyStatus !== "not-requested",
  );
  const proofGap = proofGapFor(input.continuity, {
    diagnosticHasVerifySignal,
    seedVerificationStatus,
    diagnosticVerifyStatus,
  });
  const pendingAction = pendingActionFor(input.continuity, proofGap);

  return {
    seedActionKind,
    hasActionResultSeed,
    seedWasReadLike,
    lastTaskWasReadLike,
    lastTaskWasMutationLike,
    seedVerificationStatus,
    diagnosticVerifyStatus,
    diagnosticHasVerifySignal,
    pendingAction,
    proofGap,
    nextAction: input.continuity.pendingNextAction ?? pendingAction ?? input.continuity.lastVerificationNextAction,
  };
}

function proofGapFor(
  continuity: ContinuityStateLike,
  input: {
    readonly diagnosticHasVerifySignal: boolean;
    readonly seedVerificationStatus?: string;
    readonly diagnosticVerifyStatus?: string;
  },
): readonly string[] {
  return freeze([
    ...(continuity.pendingProofGap ?? []),
    ...(continuity.recentChangedFiles?.length && !continuity.recentVerifiedFiles?.length ? ["changed files not verified"] : []),
    ...(continuity.recentFailedFiles?.length ? ["recent failure unresolved"] : []),
    ...(input.seedVerificationStatus && input.seedVerificationStatus !== "passed" ? ["seed verification not passed"] : []),
    ...(input.diagnosticHasVerifySignal && input.diagnosticVerifyStatus !== "passed" ? ["diagnostic verification not passed"] : []),
  ].map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean));
}

function pendingActionFor(continuity: ContinuityStateLike, proofGap: readonly string[]): string | undefined {
  if (continuity.pendingAction) {
    return continuity.pendingAction;
  }
  if (proofGap.some((gap) => gap.includes("context"))) {
    return "search";
  }
  if (proofGap.some((gap) => gap.includes("verified") || gap.includes("verification"))) {
    return "verify";
  }
  if (continuity.recentFailedFiles?.length) {
    return "repair";
  }
  if (continuity.lastVerificationNextAction) {
    return continuity.lastVerificationNextAction;
  }
  return undefined;
}

function freeze<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}
