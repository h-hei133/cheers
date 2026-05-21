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
    `Hunks: ${hunkSummary(result)}`,
    `Changed: ${result.changedFiles.join(", ") || "none"}`,
    `Mutation: ${result.changedFiles.length > 0 ? "applied" : "not run"}`,
    `Route: ${routeLabel(result)}`,
    "Raw content: excluded",
  ].join("\n");
  return input.printMode ? output : `\n${output}\n`;
}

function hunkSummary(result: EditProposalApplyResult): string {
  if ("route" in result && result.route.source === "proposal-hunk-set-route") {
    const changed = result.route.fileResults
      .filter((file) => file.status === "written")
      .reduce((count, file) => count + file.hunkCount, 0);
    const failed = result.route.failedFiles.reduce(
      (count, file) => count + (file.hunkIds?.length ?? 1),
      0,
    );
    const unattempted = result.route.unattemptedFiles.reduce(
      (count, file) => count + (file.hunkIds?.length ?? 1),
      0,
    );
    return `${result.route.hunkCount} total; ${changed} changed; ${failed} failed; ${unattempted} unattempted`;
  }
  return "not available";
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
