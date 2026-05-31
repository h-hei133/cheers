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

  return {
    seedActionKind,
    hasActionResultSeed,
    seedWasReadLike,
    lastTaskWasReadLike,
    lastTaskWasMutationLike,
    seedVerificationStatus,
    diagnosticVerifyStatus,
    diagnosticHasVerifySignal,
  };
}
