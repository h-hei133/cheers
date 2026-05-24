import {
  buildGeneratedEditProposalManifest,
  type GeneratedEditProposalManifest,
} from "./generatedEditProposal.js";
import {
  buildGeneratedEditProposalReview,
  type EditProposalReview,
} from "./editProposalReview.js";

export type PlanningMutationHandoffReadiness = "review-ready" | "blocked";

export type PlanningMutationHandoffState =
  | "planning-only"
  | "handoff-ready"
  | "unsupported"
  | "missing-context";

export type PlanningMutationHandoffBackendLane =
  | "generated-edit-proposal-review-only"
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

export interface PlanningMutationHandoffContextReceiptInput {
  readonly id: string;
  readonly path: string;
  readonly summary: string;
  readonly relevance: string;
}

export interface PlanningMutationHandoffReadEvidenceInput {
  readonly id: string;
  readonly path: string;
  readonly reason: string;
  readonly source: string;
}

export interface PlanningMutationHandoffTarget {
  readonly path: string;
  readonly rationale: string;
  readonly readiness: PlanningMutationHandoffTargetInput["readiness"];
  readonly handoffRoute: PlanningMutationHandoffTargetInput["handoffRoute"];
  readonly relevantContextReceiptIds: readonly string[];
  readonly readEvidenceIds: readonly string[];
  readonly expectedChangeSummary: string;
  readonly verificationIntentSummary: string;
  readonly unsupportedReasons: readonly string[];
}

export interface PlanningMutationHandoffVerificationIntent {
  readonly available: boolean;
  readonly summary: string;
  readonly evidenceIds: readonly string[];
}

export interface PlanningMutationHandoffProjection {
  readonly handoffId: string;
  readonly handoffState: PlanningMutationHandoffState;
  readonly readiness: PlanningMutationHandoffReadiness;
  readonly targetPaths: readonly string[];
  readonly targets: readonly PlanningMutationHandoffTarget[];
  readonly contextReceiptIds: readonly string[];
  readonly readEvidenceIds: readonly string[];
  readonly expectedChangeSummary: string;
  readonly verificationIntent: PlanningMutationHandoffVerificationIntent;
  readonly unsupportedReasons: readonly string[];
  readonly route: "Route203-206-proof-carrying-backend-target";
  readonly backendLane: PlanningMutationHandoffBackendLane;
  readonly backendConsumption: "not-run";
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
  readonly contextReceipts?: readonly PlanningMutationHandoffContextReceiptInput[];
  readonly readEvidence?: readonly PlanningMutationHandoffReadEvidenceInput[];
  readonly expectedChangeSummary?: string;
  readonly verificationIntentSummary?: string;
  readonly verificationEvidenceIds?: readonly string[];
}): PlanningMutationHandoffProjection {
  const targetPaths = input.editTargets.map((target) => target.path);
  const contextReceipts = input.contextReceipts ?? [];
  const readEvidence = input.readEvidence ?? [];
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
  const handoffState = selectHandoffState({
    reviewReady,
    targetCount: targetPaths.length,
    missingFacts: input.missingFacts,
    unsupportedTargetCount: unsupportedTargets.length,
    taskKind: input.taskKind,
  });
  const expectedChangeSummary = input.expectedChangeSummary ??
    buildExpectedChangeSummary({ targetPaths, taskKind: input.taskKind });
  const verificationIntent = buildVerificationIntent({
    available: input.verificationIntentAvailable,
    summary: input.verificationIntentSummary,
    evidenceIds: input.verificationEvidenceIds ?? [],
  });
  const unsupportedReasons = buildUnsupportedReasons({
    handoffState,
    blockedReasons,
    unsupportedTargets,
  });
  const targets = input.editTargets.map((target) => ({
    path: target.path,
    rationale: target.rationale,
    readiness: target.readiness,
    handoffRoute: target.handoffRoute,
    relevantContextReceiptIds: contextReceipts.map((receipt) => receipt.id),
    readEvidenceIds: readEvidence.map((evidence) => evidence.id),
    expectedChangeSummary,
    verificationIntentSummary: verificationIntent.summary,
    unsupportedReasons: buildTargetUnsupportedReasons({
      target,
      blockedReasons,
    }),
  }));
  const handoffId = buildHandoffId({
    handoffState,
    targetPaths,
    contextReceiptIds: contextReceipts.map((receipt) => receipt.id),
    readEvidenceIds: readEvidence.map((evidence) => evidence.id),
    expectedChangeSummary,
    verificationIntentSummary: verificationIntent.summary,
  });
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
    `planning-mutation-handoff:id:${handoffId}`,
    "planning-mutation-handoff:structured-contract:v1",
    `planning-mutation-handoff:state:${handoffState}`,
    `planning-mutation-handoff:readiness:${reviewReady ? "review-ready" : "blocked"}`,
    `planning-mutation-handoff:target-count:${targetPaths.length}`,
    `planning-mutation-handoff:context-receipts:${contextReceipts.length}`,
    `planning-mutation-handoff:read-evidence:${readEvidence.length}`,
    `planning-mutation-handoff:verification-intent:${verificationIntent.available ? "available" : "missing"}`,
    `planning-mutation-handoff:backend-lane:${backendLane}`,
    "planning-mutation-handoff:backend-consumption:not-run",
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
    handoffId,
    handoffState,
    readiness: reviewReady ? "review-ready" : "blocked",
    targetPaths,
    targets,
    contextReceiptIds: contextReceipts.map((receipt) => receipt.id),
    readEvidenceIds: readEvidence.map((evidence) => evidence.id),
    expectedChangeSummary,
    verificationIntent,
    unsupportedReasons,
    route: "Route203-206-proof-carrying-backend-target",
    backendLane,
    backendConsumption: "not-run",
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

function selectHandoffState(input: {
  readonly reviewReady: boolean;
  readonly targetCount: number;
  readonly missingFacts: readonly string[];
  readonly unsupportedTargetCount: number;
  readonly taskKind: string;
}): PlanningMutationHandoffState {
  if (input.reviewReady) {
    return "handoff-ready";
  }
  if (input.missingFacts.length > 0 && input.targetCount > 0) {
    return "missing-context";
  }
  if (isReadOnlyTask(input.taskKind) && input.targetCount === 0) {
    return "planning-only";
  }
  if (input.unsupportedTargetCount > 0 || input.targetCount === 0) {
    return "unsupported";
  }
  return "missing-context";
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

function buildUnsupportedReasons(input: {
  readonly handoffState: PlanningMutationHandoffState;
  readonly blockedReasons: readonly string[];
  readonly unsupportedTargets: readonly PlanningMutationHandoffTargetInput[];
}): readonly string[] {
  if (input.handoffState === "handoff-ready") {
    return [];
  }
  return unique([
    ...input.blockedReasons,
    ...input.unsupportedTargets.map((target) =>
      `${target.path}: unsupported before mutation runtime`,
    ),
  ]);
}

function buildTargetUnsupportedReasons(input: {
  readonly target: PlanningMutationHandoffTargetInput;
  readonly blockedReasons: readonly string[];
}): readonly string[] {
  return unique([
    ...(input.target.readiness === "needs-more-context" ? input.blockedReasons : []),
    ...(input.target.readiness === "unsupported" ||
      input.target.handoffRoute === "unsupported-before-mutation-runtime"
      ? ["target is unsupported before the mutation runtime"]
      : []),
  ]);
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
  return "generated-edit-proposal-review-only";
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
      "review=generated-edit-proposal-review-only",
      "confirmation=review-required",
      "mutationAuthority=not-granted",
      "raw-content-excluded",
  ].join("; ");
}

function buildExpectedChangeSummary(input: {
  readonly targetPaths: readonly string[];
  readonly taskKind: string;
}): string {
  if (input.targetPaths.length > 0) {
    return `Planning selected ${input.targetPaths.join(", ")} for ${input.taskKind}; exact old/new mapping is still required.`;
  }
  if (isReadOnlyTask(input.taskKind)) {
    return "Read-only planning produced analysis only; no mutation change is expected.";
  }
  return "No concrete mutation target was selected; no change is prepared.";
}

function buildVerificationIntent(input: {
  readonly available: boolean;
  readonly summary?: string;
  readonly evidenceIds: readonly string[];
}): PlanningMutationHandoffVerificationIntent {
  return {
    available: input.available,
    summary: input.summary ??
      (input.available
        ? "Planning preserved verification intent for the existing execution route; command-dispatch remains not-run."
        : "No concrete verification intent is ready for mutation execution."),
    evidenceIds: input.evidenceIds,
  };
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

function buildHandoffId(input: {
  readonly handoffState: PlanningMutationHandoffState;
  readonly targetPaths: readonly string[];
  readonly contextReceiptIds: readonly string[];
  readonly readEvidenceIds: readonly string[];
  readonly expectedChangeSummary: string;
  readonly verificationIntentSummary: string;
}): string {
  const payload = JSON.stringify(input);
  let hash = 0;
  for (let index = 0; index < payload.length; index += 1) {
    hash = (hash * 31 + payload.charCodeAt(index)) >>> 0;
  }
  return `planning-mutation-handoff-${hash.toString(16).padStart(8, "0")}`;
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
