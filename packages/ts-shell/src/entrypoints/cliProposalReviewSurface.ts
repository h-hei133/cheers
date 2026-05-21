import {
  formatEditProposalReviewForPrint,
  type EditProposalApplyResult,
  type EditProposalReview,
} from "../orchestration/editPatchModule.js";

export function formatCliProposalReviewOutput(input: {
  readonly review: EditProposalReview;
  readonly printMode: boolean;
}): string {
  const output = formatEditProposalReviewForPrint(input.review);
  return input.printMode ? output : `\n${output}\n`;
}

export function formatCliProposalApplyOutput(input: {
  readonly applyResult: EditProposalApplyResult;
  readonly printMode: boolean;
}): string {
  const result = input.applyResult;
  const output = [
    "Proposal apply",
    `Proposal: ${"proposalId" in result ? result.proposalId ?? "(none)" : "(none)"}`,
    `Status: ${result.status}`,
    `Changed: ${result.changedFiles.join(", ") || "none"}`,
    `Mutation: ${result.changedFiles.length > 0 ? "applied" : "not run"}`,
    `Route: ${routeLabel(result)}`,
    "Raw content: excluded",
  ].join("\n");
  return input.printMode ? output : `\n${output}\n`;
}

function routeLabel(result: EditProposalApplyResult): string {
  if ("route" in result) {
    if (result.route.source === "proposal-hunk-set-route") {
      return "proposal hunk-set";
    }
    if (result.route.source === "target-set-edit-route") {
      return "target-set transaction";
    }
    return "fenced replacement";
  }
  return "no-write";
}
