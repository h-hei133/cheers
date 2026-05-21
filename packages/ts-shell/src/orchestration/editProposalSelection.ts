import type { EditProposalReview, EditProposalReviewHunk } from "./editProposalReview.js";

export type EditProposalSelectionAction =
  | "select-all-exact"
  | "select-one-target"
  | "select-target-set-subset"
  | "reject-proposal"
  | "request-more-information";
export type EditProposalConfirmationState =
  | "review-required"
  | "selection-required"
  | "rejected"
  | "confirmed-review-only"
  | "confirmed-exact-single-target"
  | "confirmed-exact-target-set"
  | "invalid-selection"
  | "unsupported-for-apply";

export type EditProposalSelection =
  | {
      readonly state: "confirmed-exact-single-target";
      readonly proposalId: string;
      readonly source: EditProposalReview["source"];
      readonly selectedHunks: readonly [EditProposalReviewHunk];
      readonly selectedTargetLabels: readonly [string];
      readonly mutationAuthority: "not-granted";
      readonly reason: string;
      readonly nextAction: string;
      readonly evidence: readonly string[];
      readonly transcriptSummary: string;
    }
  | {
      readonly state: "confirmed-exact-target-set";
      readonly proposalId: string;
      readonly source: EditProposalReview["source"];
      readonly selectedHunks: readonly EditProposalReviewHunk[];
      readonly selectedTargetLabels: readonly string[];
      readonly mutationAuthority: "not-granted";
      readonly reason: string;
      readonly nextAction: string;
      readonly evidence: readonly string[];
      readonly transcriptSummary: string;
    }
  | {
      readonly state: Exclude<
        EditProposalConfirmationState,
        "confirmed-exact-single-target" | "confirmed-exact-target-set"
      >;
      readonly proposalId: string;
      readonly source: EditProposalReview["source"];
      readonly selectedHunks: readonly EditProposalReviewHunk[];
      readonly selectedTargetLabels: readonly string[];
      readonly mutationAuthority: "not-granted";
      readonly reason: string;
      readonly nextAction: string;
      readonly evidence: readonly string[];
      readonly transcriptSummary: string;
    };

export function selectEditProposalHunks(input: {
  readonly review: EditProposalReview;
  readonly action: EditProposalSelectionAction;
  readonly targetLabels?: readonly string[];
  readonly hunkIds?: readonly string[];
  readonly explicitConfirmation?: boolean;
  readonly maxFiles?: number;
}): EditProposalSelection {
  const maxFiles = input.maxFiles ?? 3;
  if (input.action === "reject-proposal") {
    return stoppedSelection({
      review: input.review,
      state: "rejected",
      selectedHunks: [],
      reason: "Proposal was rejected; mutation did not run.",
      nextAction: "Continue with a revised proposal or a different edit request.",
      evidence: ["edit-proposal-selection:rejected"],
    });
  }
  if (input.action === "request-more-information") {
    return stoppedSelection({
      review: input.review,
      state: "confirmed-review-only",
      selectedHunks: [],
      reason: "Proposal remains review-only while more information is requested.",
      nextAction: "Provide more exact mapping or constraints before apply.",
      evidence: ["edit-proposal-selection:review-only"],
    });
  }
  const selectedHunks = selectHunks(input);
  if (input.review.reviewStatus === "review-required" && selectedHunks.length === 0) {
    return stoppedSelection({
      review: input.review,
      state: "review-required",
      selectedHunks: [],
      reason: "Proposal still requires review before hunk selection.",
      nextAction: "Review proposal summaries and exact mapping readiness first.",
      evidence: ["edit-proposal-selection:review-required"],
    });
  }
  if (selectedHunks.length === 0) {
    return stoppedSelection({
      review: input.review,
      state: "selection-required",
      selectedHunks,
      reason: "No proposal hunks were selected.",
      nextAction: "Select one exact hunk or an exact target-set subset before apply.",
      evidence: ["edit-proposal-selection:selection-required"],
    });
  }
  if (selectedHunks.some((hunk) => !hunk.exactMappingReady)) {
    return stoppedSelection({
      review: input.review,
      state: "unsupported-for-apply",
      selectedHunks,
      reason: "Selected proposal hunks are not all exact old/new mappings.",
      nextAction: "Keep non-exact hunks review-only or provide exact mapping.",
      evidence: ["edit-proposal-selection:non-exact-hunk"],
    });
  }
  if (!input.explicitConfirmation) {
    return stoppedSelection({
      review: input.review,
      state: "selection-required",
      selectedHunks,
      reason: "Explicit confirmation is required before proposal apply.",
      nextAction: "Confirm the selected exact hunks before apply.",
      evidence: ["edit-proposal-selection:explicit-confirmation-required"],
    });
  }
  const selectedTargetLabels = Array.from(
    new Set(selectedHunks.map((hunk) => hunk.targetLabel)),
  );
  if (selectedTargetLabels.length > maxFiles) {
    return stoppedSelection({
      review: input.review,
      state: "invalid-selection",
      selectedHunks,
      reason: `Selected target set has ${selectedTargetLabels.length} files; max is ${maxFiles}.`,
      nextAction: `Select at most ${maxFiles} exact targets.`,
      evidence: ["edit-proposal-selection:over-max-files"],
    });
  }
  if (selectedTargetLabels.length === 1 && selectedHunks.length > 1) {
    return stoppedSelection({
      review: input.review,
      state: "unsupported-for-apply",
      selectedHunks,
      reason: "Route 178 supports one exact proposal hunk per file.",
      nextAction:
        "Apply one hunk for this file, or use a later route for bounded multi-hunk-per-file support.",
      evidence: ["edit-proposal-selection:multiple-hunks-per-file"],
    });
  }
  if (selectedTargetLabels.length === 1) {
    return {
      ...baseSelection({
        review: input.review,
        state: "confirmed-exact-single-target",
        selectedHunks,
        reason: "One exact proposal hunk was explicitly confirmed.",
        nextAction: "Apply through the existing fenced replacement route.",
        evidence: ["edit-proposal-selection:confirmed-exact-single-target"],
      }),
      selectedHunks: [selectedHunks[0]!],
      selectedTargetLabels: [selectedTargetLabels[0]!],
    };
  }
  return baseSelection({
    review: input.review,
    state: "confirmed-exact-target-set",
    selectedHunks,
    reason: "Exact target-set proposal hunks were explicitly confirmed.",
    nextAction: "Apply through the existing target-set transaction route.",
    evidence: ["edit-proposal-selection:confirmed-exact-target-set"],
  });
}

function selectHunks(input: {
  readonly review: EditProposalReview;
  readonly action: EditProposalSelectionAction;
  readonly targetLabels?: readonly string[];
  readonly hunkIds?: readonly string[];
}): readonly EditProposalReviewHunk[] {
  switch (input.action) {
    case "select-all-exact":
      return input.review.hunkSummaries.filter((hunk) => hunk.exactMappingReady);
    case "select-one-target": {
      const label = input.targetLabels?.[0];
      return label
        ? input.review.hunkSummaries.filter((hunk) => hunk.targetLabel === label)
        : [];
    }
    case "select-target-set-subset": {
      const labels = new Set(input.targetLabels ?? []);
      const hunkIds = new Set(input.hunkIds ?? []);
      return input.review.hunkSummaries.filter(
        (hunk) => labels.has(hunk.targetLabel) || hunkIds.has(hunk.hunkId),
      );
    }
    default:
      return [];
  }
}

function stoppedSelection(input: {
  readonly review: EditProposalReview;
  readonly state: Exclude<
    EditProposalConfirmationState,
    "confirmed-exact-single-target" | "confirmed-exact-target-set"
  >;
  readonly selectedHunks: readonly EditProposalReviewHunk[];
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): EditProposalSelection {
  return baseSelection(input);
}

function baseSelection(input: {
  readonly review: EditProposalReview;
  readonly state: EditProposalConfirmationState;
  readonly selectedHunks: readonly EditProposalReviewHunk[];
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): EditProposalSelection {
  const selectedTargetLabels = Array.from(
    new Set(input.selectedHunks.map((hunk) => hunk.targetLabel)),
  );
  const transcriptSummary = [
    `edit-proposal-selection proposal=${input.review.proposalId}`,
    `state=${input.state}`,
    `targets=${selectedTargetLabels.join(", ") || "(none)"}`,
    `hunks=${input.selectedHunks.map((hunk) => hunk.hunkId).join(", ") || "(none)"}`,
    "mutation:not-run",
    "mutationAuthority:not-granted",
    "raw-content-excluded",
  ].join("; ");
  return {
    state: input.state,
    proposalId: input.review.proposalId,
    source: input.review.source,
    selectedHunks: input.selectedHunks,
    selectedTargetLabels,
    mutationAuthority: "not-granted",
    reason: input.reason,
    nextAction: input.nextAction,
    evidence: [
      ...input.review.evidence,
      ...input.evidence,
      `edit-proposal-selection:state:${input.state}`,
      "edit-proposal-selection:selection-is-not-write-authority",
      "edit-proposal-selection:mutation:not-run",
      "edit-proposal-selection:raw-content-excluded",
    ],
    transcriptSummary,
  } as EditProposalSelection;
}
