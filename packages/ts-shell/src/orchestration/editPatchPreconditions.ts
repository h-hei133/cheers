import type {
  EditPatchMutationManifest,
  EditPatchRequirementState,
} from "./editPatchManifest.js";

export type EditPatchPreconditionKey =
  | "explicit-target"
  | "content-or-transform"
  | "candidate-confirmation"
  | "workspace-authority"
  | "stale-read"
  | "verification"
  | "rollback-snapshot"
  | "user-confirmation";

export type EditPatchPreconditionStatus =
  | "satisfied"
  | "missing"
  | "required"
  | "blocked"
  | "delegated-to-current-route"
  | "not-required";

export interface EditPatchPreconditionFactInput {
  readonly explicitTargetPresent?: boolean;
  readonly concreteContentOrTransformPresent?: boolean;
  readonly candidateTargetsConfirmed?: boolean;
  readonly workspaceAuthoritySatisfied?: boolean;
  readonly staleReadSatisfied?: boolean;
  readonly verificationPlanPresent?: boolean;
  readonly rollbackSnapshotSatisfied?: boolean;
  readonly userConfirmationSatisfied?: boolean;
}

export interface EditPatchPreconditionRow {
  readonly key: EditPatchPreconditionKey;
  readonly status: EditPatchPreconditionStatus;
  readonly reason: string;
}

export interface EditPatchPreconditionProjection {
  readonly overall:
    | "ready-current-route"
    | "blocked-preview-only"
    | "blocked-unsupported";
  readonly rows: readonly EditPatchPreconditionRow[];
  readonly missing: readonly EditPatchPreconditionKey[];
  readonly blocked: readonly EditPatchPreconditionKey[];
  readonly delegated: readonly EditPatchPreconditionKey[];
  readonly mutationAllowedNow: boolean;
}

export function evaluateEditPatchPreconditions(input: {
  readonly manifest: EditPatchMutationManifest;
  readonly facts?: EditPatchPreconditionFactInput;
}): EditPatchPreconditionProjection {
  const rows: EditPatchPreconditionRow[] = [
    explicitTargetRow(input.manifest, input.facts),
    contentRow(input.manifest, input.facts),
    candidateConfirmationRow(input.manifest, input.facts),
    requirementRow({
      key: "workspace-authority",
      requirement: input.manifest.workspaceAuthorityRequirement,
      satisfied: input.facts?.workspaceAuthoritySatisfied,
      missingReason: "Workspace authority facts are required before mutation.",
    }),
    requirementRow({
      key: "stale-read",
      requirement: input.manifest.staleReadRequirement,
      satisfied: input.facts?.staleReadSatisfied,
      missingReason: "Final stale-read facts are required before mutation.",
    }),
    requirementRow({
      key: "verification",
      requirement: input.manifest.verificationRequirement,
      satisfied: input.facts?.verificationPlanPresent,
      missingReason: "A post-write verification plan is required before mutation.",
    }),
    requirementRow({
      key: "rollback-snapshot",
      requirement: input.manifest.rollbackSnapshotRequirement,
      satisfied: input.facts?.rollbackSnapshotSatisfied,
      missingReason:
        "A rollback or snapshot story is required before broad future execution.",
    }),
    requirementRow({
      key: "user-confirmation",
      requirement: input.manifest.confirmationRequirement,
      satisfied: input.facts?.userConfirmationSatisfied,
      missingReason: "Explicit user confirmation is required before mutation.",
    }),
  ];

  const missing = rows
    .filter((row) => row.status === "missing" || row.status === "required")
    .map((row) => row.key);
  const blocked = rows
    .filter((row) => row.status === "blocked")
    .map((row) => row.key);
  const delegated = rows
    .filter((row) => row.status === "delegated-to-current-route")
    .map((row) => row.key);
  const overall = overallStatus(input.manifest, missing, blocked);

  return {
    overall,
    rows,
    missing,
    blocked,
    delegated,
    mutationAllowedNow:
      input.manifest.mutationAllowedNow && overall === "ready-current-route",
  };
}

function explicitTargetRow(
  manifest: EditPatchMutationManifest,
  facts: EditPatchPreconditionFactInput | undefined,
): EditPatchPreconditionRow {
  if (!manifest.requiredPreconditions.includes("explicit-target")) {
    return {
      key: "explicit-target",
      status: "not-required",
      reason: "Explicit target is not required for this non-edit state.",
    };
  }
  const present =
    facts?.explicitTargetPresent ?? manifest.explicitTargets.length > 0;
  return present
    ? {
        key: "explicit-target",
        status: "satisfied",
        reason: "Explicit target is present.",
      }
    : {
        key: "explicit-target",
        status: "missing",
        reason: "An explicit target is required.",
      };
}

function contentRow(
  manifest: EditPatchMutationManifest,
  facts: EditPatchPreconditionFactInput | undefined,
): EditPatchPreconditionRow {
  const requiresContent =
    manifest.requiredPreconditions.includes("concrete-content") ||
    manifest.requiredPreconditions.includes("exact-old-new-mapping") ||
    manifest.requiredPreconditions.includes("target-constraint-manifest");
  if (!requiresContent) {
    return {
      key: "content-or-transform",
      status: "not-required",
      reason: "Concrete content or transform manifest is not required.",
    };
  }
  const present =
    facts?.concreteContentOrTransformPresent ??
    (manifest.supportStatus === "current-supported" &&
      manifest.contentSummary !== "missing");
  return present
    ? {
        key: "content-or-transform",
        status: "satisfied",
        reason: "Content, exact mapping, or transform manifest is represented.",
      }
    : {
        key: "content-or-transform",
        status: "missing",
        reason: "Concrete content, exact mapping, or transform manifest is missing.",
      };
}

function candidateConfirmationRow(
  manifest: EditPatchMutationManifest,
  facts: EditPatchPreconditionFactInput | undefined,
): EditPatchPreconditionRow {
  if (!manifest.requiredPreconditions.includes("candidate-file-list")) {
    return {
      key: "candidate-confirmation",
      status: "not-required",
      reason: "Candidate target confirmation is not required.",
    };
  }
  return facts?.candidateTargetsConfirmed
    ? {
        key: "candidate-confirmation",
        status: "satisfied",
        reason: "Candidate target set is confirmed.",
      }
    : {
        key: "candidate-confirmation",
        status: "required",
        reason: "Candidate target set must be confirmed before mutation.",
      };
}

function requirementRow(input: {
  readonly key: EditPatchPreconditionKey;
  readonly requirement: EditPatchRequirementState;
  readonly satisfied: boolean | undefined;
  readonly missingReason: string;
}): EditPatchPreconditionRow {
  if (input.requirement === "not-required") {
    return {
      key: input.key,
      status: "not-required",
      reason: "This precondition is not required for the requested mode.",
    };
  }
  if (input.requirement === "delegated-to-current-route") {
    return {
      key: input.key,
      status: "delegated-to-current-route",
      reason: "Existing bounded route owns this precondition unchanged.",
    };
  }
  return input.satisfied
    ? {
        key: input.key,
        status: "satisfied",
        reason: "Precondition fact is present.",
      }
    : {
        key: input.key,
        status: "required",
        reason: input.missingReason,
      };
}

function overallStatus(
  manifest: EditPatchMutationManifest,
  missing: readonly EditPatchPreconditionKey[],
  blocked: readonly EditPatchPreconditionKey[],
): EditPatchPreconditionProjection["overall"] {
  if (manifest.supportStatus === "current-supported" && blocked.length === 0) {
    return missing.length === 0 ? "ready-current-route" : "ready-current-route";
  }
  if (manifest.supportStatus === "future-only") {
    return "blocked-preview-only";
  }
  return "blocked-unsupported";
}
