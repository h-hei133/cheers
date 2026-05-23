import {
  buildGeneratedEditProposalManifest,
  type GeneratedEditProposalManifest,
} from "./generatedEditProposal.js";
import {
  buildGeneratedEditProposalReview,
  type EditProposalReview,
} from "./editProposalReview.js";

export type PlanningMutationHandoffReadiness = "review-ready" | "blocked";

export type PlanningMutationHandoffBackendLane =
  | "generated-edit-proposal-review"
  | "none";

export type PlanningMutationHandoffExecutionLane =
  | "existing-exact-fenced-route"
  | "existing-target-set-route"
  | "none";

export type PlanningMutationHandoffRequirementId =
  | "selected-target"
  | "exact-old-new-mapping"
  | "explicit-target-confirmation"
  | "workspace-authority"
  | "final-stale-read"
  | "snapshot-receipt"
  | "post-write-verification"
  | "claim-ledger-verdict";

export type PlanningMutationHandoffRequirementStatus =
  | "available-for-review"
  | "missing-before-execution"
  | "required-by-existing-route"
  | "not-applicable";

export type PlanningMutationHandoffRequirementOwner =
  | "planning-runtime"
  | "reviewer"
  | "existing-mutation-route"
  | "claim-ledger";

export interface PlanningMutationHandoffRequirement {
  readonly id: PlanningMutationHandoffRequirementId;
  readonly status: PlanningMutationHandoffRequirementStatus;
  readonly owner: PlanningMutationHandoffRequirementOwner;
  readonly detail: string;
}

export interface PlanningMutationHandoffTargetInput {
  readonly path: string;
  readonly rationale: string;
  readonly handoffRoute:
    | "existing-proof-carrying-mutation-runtime"
    | "unsupported-before-mutation-runtime";
  readonly readiness: "ready-for-review" | "needs-more-context" | "unsupported";
}

export interface PlanningMutationHandoffProjection {
  readonly readiness: PlanningMutationHandoffReadiness;
  readonly targetPaths: readonly string[];
  readonly route: "Route203-206-proof-carrying-backend";
  readonly backendLane: PlanningMutationHandoffBackendLane;
  readonly executionLane: PlanningMutationHandoffExecutionLane;
  readonly proposalId?: string;
  readonly proposalSummary?: string;
  readonly proposal?: GeneratedEditProposalManifest;
  readonly proposalReview?: EditProposalReview;
  readonly reviewState: "review-required" | "blocked";
  readonly permissionState: "not-requested";
  readonly requirements: readonly PlanningMutationHandoffRequirement[];
  readonly blockedReasons: readonly string[];
  readonly reason: string;
  readonly nextAction: string;
  readonly mutationAuthority: "not-granted";
  readonly evidence: readonly string[];
}

export function buildPlanningMutationHandoffProjection(input: {
  readonly editTargets: readonly PlanningMutationHandoffTargetInput[];
  readonly missingFacts: readonly string[];
  readonly taskKind: string;
  readonly verificationIntentAvailable: boolean;
}): PlanningMutationHandoffProjection {
  const targetPaths = input.editTargets.map((target) => target.path);
  const unsupportedTargets = input.editTargets.filter(
    (target) =>
      target.readiness === "unsupported" ||
      target.handoffRoute === "unsupported-before-mutation-runtime",
  );
  const reviewReadyTargets = input.editTargets.filter(
    (target) => target.readiness === "ready-for-review",
  );
  const blockedReasons = buildBlockedReasons({
    targetCount: targetPaths.length,
    missingFacts: input.missingFacts,
    unsupportedTargetCount: unsupportedTargets.length,
    taskKind: input.taskKind,
  });
  const reviewReady = reviewReadyTargets.length > 0 && blockedReasons.length === 0;
  const proposal = reviewReady
    ? buildGeneratedEditProposalManifest({
        targets: targetPaths,
        requestedOperationKind: "discovery",
        proposedContentStatus: "safe-summary-only",
        exactMappingStatus: "missing-old-block",
        confirmationStatus: "review-required",
        mutationReadiness: "review-required-no-write",
        safeSummary: buildProposalSummary({
          targetPaths,
          editTargets: input.editTargets,
        }),
        evidence: [
          "planning-mutation-handoff:proposal-source:planning-runtime",
          "planning-mutation-handoff:proposal-kind:safe-summary-only",
          "planning-mutation-handoff:exact-mapping:not-produced",
        ],
      })
    : undefined;
  const proposalReview = proposal
    ? buildGeneratedEditProposalReview(proposal)
    : undefined;
  const backendLane = selectBackendLane({
    reviewReady,
  });
  const executionLane = selectExecutionLane({ reviewReady, targetCount: targetPaths.length });
  const requirements = buildRequirements({
    targetPaths,
    reviewReady,
    verificationIntentAvailable: input.verificationIntentAvailable,
  });
  const evidence = unique([
    "planning-mutation-handoff:projection-created",
    `planning-mutation-handoff:readiness:${reviewReady ? "review-ready" : "blocked"}`,
    `planning-mutation-handoff:target-count:${targetPaths.length}`,
    `planning-mutation-handoff:backend-lane:${backendLane}`,
    `planning-mutation-handoff:execution-lane:${executionLane}`,
    `planning-mutation-handoff:review-state:${reviewReady ? "review-required" : "blocked"}`,
    "planning-mutation-handoff:permission:not-requested",
    "planning-mutation-handoff:mutation-authority:not-granted",
    "planning-mutation-handoff:provider-call:not-run",
    "planning-mutation-handoff:apply:not-run",
    "planning-mutation-handoff:command-dispatch:not-run",
    "planning-mutation-handoff:raw-content-excluded",
    ...requirements.map((requirement) =>
      `planning-mutation-handoff:requirement:${requirement.id}:${requirement.status}`,
    ),
    ...(proposal?.evidence ?? []),
    ...(proposalReview?.evidence ?? []),
  ]);

  return {
    readiness: reviewReady ? "review-ready" : "blocked",
    targetPaths,
    route: "Route203-206-proof-carrying-backend",
    backendLane,
    executionLane,
    ...(proposal ? { proposalId: proposal.proposalId } : {}),
    ...(proposal ? { proposalSummary: proposal.safeSummary } : {}),
    ...(proposal ? { proposal } : {}),
    ...(proposalReview ? { proposalReview } : {}),
    reviewState: reviewReady ? "review-required" : "blocked",
    permissionState: "not-requested",
    requirements,
    blockedReasons,
    reason: buildReason({
      reviewReady,
      targetPaths,
      missingFacts: input.missingFacts,
      taskKind: input.taskKind,
    }),
    nextAction: buildNextAction({ reviewReady, targetPaths }),
    mutationAuthority: "not-granted",
    evidence,
  };
}

function buildBlockedReasons(input: {
  readonly targetCount: number;
  readonly missingFacts: readonly string[];
  readonly unsupportedTargetCount: number;
  readonly taskKind: string;
}): readonly string[] {
  const reasons: string[] = [];
  if (input.targetCount === 0) {
    reasons.push(
      isReadOnlyTask(input.taskKind)
        ? "read-only planning task selected no mutation target"
        : "no planning edit target selected",
    );
  }
  if (input.missingFacts.length > 0) {
    reasons.push(...input.missingFacts.slice(0, 4));
  }
  if (input.unsupportedTargetCount > 0) {
    reasons.push("selected target is unsupported before the mutation runtime");
  }
  return unique(reasons);
}

function buildRequirements(input: {
  readonly targetPaths: readonly string[];
  readonly reviewReady: boolean;
  readonly verificationIntentAvailable: boolean;
}): readonly PlanningMutationHandoffRequirement[] {
  return [
    {
      id: "selected-target",
      status: input.targetPaths.length > 0 ? "available-for-review" : "not-applicable",
      owner: "planning-runtime",
      detail: input.targetPaths.length > 0
        ? `selected ${input.targetPaths.join(", ")}`
        : "no mutation target selected by this planning task",
    },
    {
      id: "exact-old-new-mapping",
      status: input.reviewReady ? "missing-before-execution" : "not-applicable",
      owner: "reviewer",
      detail:
        "Planning selects targets only; exact old/new mapping must be supplied before an existing exact lane can execute.",
    },
    {
      id: "explicit-target-confirmation",
      status: input.reviewReady ? "missing-before-execution" : "not-applicable",
      owner: "reviewer",
      detail:
        "Target confirmation remains explicit and cannot be inferred from planning output.",
    },
    {
      id: "workspace-authority",
      status: input.reviewReady ? "required-by-existing-route" : "not-applicable",
      owner: "existing-mutation-route",
      detail:
        "Existing write route must re-check workspace authority before any mutation.",
    },
    {
      id: "final-stale-read",
      status: input.reviewReady ? "required-by-existing-route" : "not-applicable",
      owner: "existing-mutation-route",
      detail:
        "Existing write route owns final stale-read immediately before writer invocation.",
    },
    {
      id: "snapshot-receipt",
      status: input.reviewReady ? "required-by-existing-route" : "not-applicable",
      owner: "existing-mutation-route",
      detail:
        "Existing proof-carrying route owns pre-write snapshot and recovery receipt.",
    },
    {
      id: "post-write-verification",
      status: input.verificationIntentAvailable && input.reviewReady
        ? "available-for-review"
        : input.reviewReady
          ? "missing-before-execution"
          : "not-applicable",
      owner: "existing-mutation-route",
      detail: input.verificationIntentAvailable
        ? "Planning produced verification intent; execution route must run and verify it."
        : "A concrete verification plan is required before mutation execution.",
    },
    {
      id: "claim-ledger-verdict",
      status: input.reviewReady ? "required-by-existing-route" : "not-applicable",
      owner: "claim-ledger",
      detail:
        "Claim Ledger remains the terminal judge for any proof-carrying mutation path.",
    },
  ];
}

function selectBackendLane(input: {
  readonly reviewReady: boolean;
}): PlanningMutationHandoffBackendLane {
  if (!input.reviewReady) {
    return "none";
  }
  return "generated-edit-proposal-review";
}

function selectExecutionLane(input: {
  readonly reviewReady: boolean;
  readonly targetCount: number;
}): PlanningMutationHandoffExecutionLane {
  if (!input.reviewReady) {
    return "none";
  }
  if (input.targetCount > 1) {
    return "existing-target-set-route";
  }
  return "existing-exact-fenced-route";
}

function buildProposalSummary(input: {
  readonly targetPaths: readonly string[];
  readonly editTargets: readonly PlanningMutationHandoffTargetInput[];
}): string {
  const rationale = input.editTargets
    .map((target) => `${target.path}: ${target.rationale}`)
    .join(" | ");
  return [
    `planning-selected edit target ${input.targetPaths.join(", ")}`,
    `rationale=${rationale || "none"}`,
      "content=safe-summary-only",
      "exact-mapping=not-produced",
      "review=generated-edit-proposal-review",
      "confirmation=review-required",
      "mutationAuthority=not-granted",
      "raw-content-excluded",
  ].join("; ");
}

function buildReason(input: {
  readonly reviewReady: boolean;
  readonly targetPaths: readonly string[];
  readonly missingFacts: readonly string[];
  readonly taskKind: string;
}): string {
  if (input.reviewReady) {
    return [
      "Planning selected reviewable edit target(s) and produced a no-write proposal review envelope for the existing proof backend.",
      "Execution remains blocked until exact mapping, explicit confirmation, workspace authority, stale-read, snapshot, verification, and Claim Ledger checks run in the existing route.",
    ].join(" ");
  }
  if (input.targetPaths.length === 0 && isReadOnlyTask(input.taskKind)) {
    return "Read-only planning path produced context, analysis, and plan evidence; no mutation target was selected.";
  }
  if (input.missingFacts.length > 0) {
    return "Planning runtime needs more grounded context before proof backend handoff.";
  }
  return "Planning runtime did not produce an edit target that can be reviewed for proof backend handoff.";
}

function buildNextAction(input: {
  readonly reviewReady: boolean;
  readonly targetPaths: readonly string[];
}): string {
  if (input.reviewReady && input.targetPaths.length > 0) {
    return "Review the selected target, provide exact old/new mapping, and explicitly confirm the target before invoking the existing exact mutation route.";
  }
  return "Resolve missing facts or provide one explicit in-workspace target plus exact mapping before requesting mutation.";
}

function isReadOnlyTask(taskKind: string): boolean {
  return taskKind === "read-file" ||
    taskKind === "inspect-files" ||
    taskKind === "repo-explain";
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
