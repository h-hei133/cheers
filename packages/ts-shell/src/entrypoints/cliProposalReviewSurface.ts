import {
  formatEditProposalReviewForPrint,
  type EditProposalReview,
} from "../orchestration/editPatchModule.js";

export function formatCliProposalReviewOutput(input: {
  readonly review: EditProposalReview;
  readonly printMode: boolean;
}): string {
  const output = formatEditProposalReviewForPrint(input.review);
  return input.printMode ? output : `\n${output}\n`;
}
