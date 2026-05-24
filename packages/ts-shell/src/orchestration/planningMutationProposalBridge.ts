import type { EditProposalReview } from "./editProposalReview.js";
import { detectProviderAnchorConflicts } from "./providerAnchorConflict.js";
import { classifyProviderAnchorQuality } from "./providerAnchorQuality.js";
import { matchProviderAnchorCandidates } from "./providerAnchorMatcher.js";
import {
  buildAnchoredProposalMappingByHunkId,
  buildAnchoredProviderProposalReview,
  buildProviderAnchoredProposal,
  type ProviderAnchoredProposalManifest,
} from "./providerAnchoredProposal.js";
import type { FencedEditMapping } from "./fencedEditPlanner.js";
import { extractProviderProposalAnchors } from "./providerProposalAnchors.js";
import type { ProviderEditRawProposal } from "./providerEditProposal.js";
import { validateProviderOutput } from "./providerOutputValidator.js";
import { hashContent } from "./patchRecovery/recoveryAuthorityStore.js";
import type { PlanningMutationHandoffProjection } from "./planningMutationHandoffProjection.js";

export type PlanningMutationProposalBridgeState =
  | "planning-only"
  | "proposal-prepared"
  | "confirmation-required"
  | "anchoring-blocked"
  | "unsupported"
  | "missing-context";

export type PlanningMutationProposalAnchorState =
  | "not-run"
  | "exact-ready"
  | "review-only"
  | "blocked"
  | "missing-exact-mapping";

export interface PlanningMutationProposalBridge {
  readonly bridgeId: string;
  readonly sourceHandoffId: string;
  readonly state: PlanningMutationProposalBridgeState;
  readonly proposalState: "not-run" | "prepared" | "invalid";
  readonly proposalId?: string;
  readonly proposalReviewStatus?: string;
  readonly anchorState: PlanningMutationProposalAnchorState;
  readonly anchoredProposalId?: string;
  readonly anchoredProposal?: ProviderAnchoredProposalManifest;
  readonly anchoredReview?: EditProposalReview;
  readonly anchoredMappingByHunkId?: ReadonlyMap<string, FencedEditMapping>;
  readonly confirmationState:
    | "not-requested"
    | "review-required"
    | "confirmation-required"
    | "unsupported";
  readonly applyState: "not-run";
  readonly verificationState: "not-run";
  readonly providerCall: "not-run";
  readonly evidenceSource:
    | "planning-handoff-summary"
    | "focused-deterministic-proposal"
    | "manual-proposal-json"
    | "planning-runtime-deterministic"
    | "live-provider-proposal";
  readonly reason: string;
  readonly nextAction: string;
  readonly mutationAuthority: "not-granted";
  readonly evidence: readonly string[];
}

export function buildPlanningMutationProposalBridge(input: {
  readonly requestId: string;
  readonly handoff: PlanningMutationHandoffProjection;
  readonly rawProposal?: ProviderEditRawProposal | null;
  readonly evidenceSource?: PlanningMutationProposalBridge["evidenceSource"];
  readonly currentContentByTargetPath?: ReadonlyMap<string, string>;
  readonly staleTargetPaths?: readonly string[];
  readonly inWorkspaceTargetPaths?: readonly string[];
}): PlanningMutationProposalBridge {
  if (input.handoff.handoffState !== "handoff-ready") {
    return stoppedBridge({
      requestId: input.requestId,
      handoff: input.handoff,
      state: mapStoppedHandoffState(input.handoff.handoffState),
      proposalState: "not-run",
      anchorState: "not-run",
      confirmationState: "not-requested",
      evidenceSource: "planning-handoff-summary",
      reason: input.handoff.reason,
      nextAction: input.handoff.nextAction,
      extraEvidence: ["planning-proposal-bridge:handoff-not-ready"],
    });
  }

  if (!input.handoff.proposal || !input.handoff.proposalReview) {
    return stoppedBridge({
      requestId: input.requestId,
      handoff: input.handoff,
      state: "unsupported",
      proposalState: "invalid",
      anchorState: "blocked",
      confirmationState: "unsupported",
      evidenceSource: "planning-handoff-summary",
      reason: "Planning handoff was ready but did not include a proposal review envelope.",
      nextAction: "Rebuild the planning handoff before proposal preparation.",
      extraEvidence: ["planning-proposal-bridge:missing-proposal-review"],
    });
  }

  if (!input.rawProposal) {
    return baseBridge({
      requestId: input.requestId,
      handoff: input.handoff,
      state: "proposal-prepared",
      proposalState: "prepared",
      anchorState: "missing-exact-mapping",
      confirmationState: "review-required",
      evidenceSource: "planning-handoff-summary",
      reason:
        "Planning handoff was consumed as a generated proposal review, but exact old/new anchors were not supplied.",
      nextAction:
        "Provide a bounded exact proposal or run an explicit provider proposal dry-run before anchoring.",
      extraEvidence: [
        "planning-proposal-bridge:proposal-review-consumed",
        "planning-proposal-bridge:anchoring:not-run:missing-exact-mapping",
      ],
    });
  }

  const targetEvidenceIds = new Map(
    input.handoff.targets.map((target) => [
      target.path,
      [...target.readEvidenceIds, ...target.relevantContextReceiptIds],
    ]),
  );
  const validation = validateProviderOutput({
    requestId: input.requestId,
    rawOutput: input.rawProposal,
    explicitTargetLabels: input.handoff.targetPaths,
  });
  const extraction = extractProviderProposalAnchors({
    requestId: input.requestId,
    rawOutput: input.rawProposal,
    validation,
    sourceProposalId: input.handoff.proposal.proposalId,
    explicitTargetEvidenceIds: targetEvidenceIds,
  });
  const matchResult = matchProviderAnchorCandidates({
    requestId: input.requestId,
    candidates: extraction.candidates,
    explicitTargetLabels: input.handoff.targetPaths,
    currentContentByTargetLabel: input.currentContentByTargetPath,
    staleTargetLabels: input.staleTargetPaths,
    inWorkspaceTargetLabels: input.inWorkspaceTargetPaths ?? input.handoff.targetPaths,
  });
  const conflict = detectProviderAnchorConflicts({
    requestId: input.requestId,
    matchResult,
    currentContentByTargetLabel: input.currentContentByTargetPath,
  });
  const anchorQuality = classifyProviderAnchorQuality({
    requestId: input.requestId,
    validation,
    extraction,
    matchResult,
    conflict,
    verificationPlan: input.rawProposal.verificationPlan,
  });
  const anchoredProposal = buildProviderAnchoredProposal({
    requestId: input.requestId,
    extraction,
    matchResult,
    conflict,
    anchorQuality,
  });
  const anchoredReview = buildAnchoredProviderProposalReview(anchoredProposal);
  const anchoredMappingByHunkId = buildAnchoredProposalMappingByHunkId({
    manifest: anchoredProposal,
    matchResult,
  });
  const exactReady =
    anchoredProposal.handoffReadiness === "exact-single-target" ||
    anchoredProposal.handoffReadiness === "exact-hunk-set";
  const blocked = anchoredProposal.handoffReadiness === "blocked";
  const invalidProposal = !validation.validForManifest;

  return baseBridge({
    requestId: input.requestId,
    handoff: input.handoff,
    state: invalidProposal
      ? "unsupported"
      : exactReady
      ? "confirmation-required"
      : blocked
        ? "anchoring-blocked"
        : "proposal-prepared",
    proposalState: invalidProposal ? "invalid" : "prepared",
    anchorState: exactReady ? "exact-ready" : blocked ? "blocked" : "review-only",
    confirmationState: exactReady
      ? "confirmation-required"
      : blocked
        ? "unsupported"
        : "review-required",
    evidenceSource: input.evidenceSource ?? "focused-deterministic-proposal",
    anchoredProposal,
    anchoredReview,
    anchoredMappingByHunkId,
    reason: exactReady
      ? "Focused deterministic proposal anchored exactly and now requires explicit confirmation before existing apply lanes can run."
      : anchoredProposal.safeSummary,
    nextAction: exactReady
      ? "Review and explicitly confirm exact hunks before invoking the existing proposal apply path."
      : "Keep the proposal review-only or supply exact current anchors.",
    extraEvidence: [
      `planning-proposal-bridge:proposal-source:${input.evidenceSource ?? "focused-deterministic-proposal"}`,
      "planning-proposal-bridge:existing-anchoring-infrastructure-consumed",
      ...validation.evidence,
      ...extraction.evidence,
      ...matchResult.evidence,
      ...conflict.evidence,
      ...anchorQuality.evidence,
      ...anchoredProposal.evidence,
      ...anchoredReview.evidence,
    ],
  });
}

function stoppedBridge(input: {
  readonly requestId: string;
  readonly handoff: PlanningMutationHandoffProjection;
  readonly state: PlanningMutationProposalBridgeState;
  readonly proposalState: PlanningMutationProposalBridge["proposalState"];
  readonly anchorState: PlanningMutationProposalAnchorState;
  readonly confirmationState: PlanningMutationProposalBridge["confirmationState"];
  readonly evidenceSource: PlanningMutationProposalBridge["evidenceSource"];
  readonly reason: string;
  readonly nextAction: string;
  readonly extraEvidence: readonly string[];
}): PlanningMutationProposalBridge {
  return baseBridge({
    ...input,
    extraEvidence: [
      ...input.extraEvidence,
      "planning-proposal-bridge:proposal:not-run",
      "planning-proposal-bridge:anchoring:not-run",
    ],
  });
}

function baseBridge(input: {
  readonly requestId: string;
  readonly handoff: PlanningMutationHandoffProjection;
  readonly state: PlanningMutationProposalBridgeState;
  readonly proposalState: PlanningMutationProposalBridge["proposalState"];
  readonly anchorState: PlanningMutationProposalAnchorState;
  readonly confirmationState: PlanningMutationProposalBridge["confirmationState"];
  readonly evidenceSource: PlanningMutationProposalBridge["evidenceSource"];
  readonly anchoredProposal?: ProviderAnchoredProposalManifest;
  readonly anchoredReview?: EditProposalReview;
  readonly anchoredMappingByHunkId?: ReadonlyMap<string, FencedEditMapping>;
  readonly reason: string;
  readonly nextAction: string;
  readonly extraEvidence: readonly string[];
}): PlanningMutationProposalBridge {
  const proposalId = input.anchoredProposal?.anchoredProposalId ?? input.handoff.proposalId;
  const proposalReviewStatus =
    input.anchoredReview?.reviewStatus ?? input.handoff.proposalReview?.reviewStatus;
  const bridgeId = buildBridgeId({
    requestId: input.requestId,
    handoffId: input.handoff.handoffId,
    state: input.state,
    proposalId,
    anchoredProposalId: input.anchoredProposal?.anchoredProposalId,
    evidenceSource: input.evidenceSource,
  });
  const evidence = unique([
    `planning-proposal-bridge:id:${bridgeId}`,
    `planning-proposal-bridge:handoff:${input.handoff.handoffId}`,
    `planning-proposal-bridge:state:${input.state}`,
    `planning-proposal-bridge:proposal:${input.proposalState}`,
    `planning-proposal-bridge:anchor:${input.anchorState}`,
    `planning-proposal-bridge:confirmation:${input.confirmationState}`,
    `planning-proposal-bridge:evidence-source:${input.evidenceSource}`,
    "planning-proposal-bridge:provider-call:not-run",
    "planning-proposal-bridge:apply:not-run",
    "planning-proposal-bridge:verification:not-run",
    "planning-proposal-bridge:mutation-authority:not-granted",
    "planning-proposal-bridge:raw-content-excluded",
    ...input.extraEvidence,
  ]);

  return {
    bridgeId,
    sourceHandoffId: input.handoff.handoffId,
    state: input.state,
    proposalState: input.proposalState,
    ...(proposalId ? { proposalId } : {}),
    ...(proposalReviewStatus ? { proposalReviewStatus } : {}),
    anchorState: input.anchorState,
    ...(input.anchoredProposal ? { anchoredProposalId: input.anchoredProposal.anchoredProposalId } : {}),
    ...(input.anchoredProposal ? { anchoredProposal: input.anchoredProposal } : {}),
    ...(input.anchoredReview ? { anchoredReview: input.anchoredReview } : {}),
    ...(input.anchoredMappingByHunkId ? { anchoredMappingByHunkId: input.anchoredMappingByHunkId } : {}),
    confirmationState: input.confirmationState,
    applyState: "not-run",
    verificationState: "not-run",
    providerCall: "not-run",
    evidenceSource: input.evidenceSource,
    reason: input.reason,
    nextAction: input.nextAction,
    mutationAuthority: "not-granted",
    evidence,
  };
}

function mapStoppedHandoffState(
  state: PlanningMutationHandoffProjection["handoffState"],
): PlanningMutationProposalBridgeState {
  if (state === "planning-only") return "planning-only";
  if (state === "missing-context") return "missing-context";
  return "unsupported";
}

function buildBridgeId(input: object): string {
  return `planning-proposal-bridge-${hashContent(JSON.stringify(input)).slice(0, 12)}`;
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
