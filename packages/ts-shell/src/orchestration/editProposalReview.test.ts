import { describe, expect, it } from "vitest";
import { buildGeneratedEditProposalManifest } from "./generatedEditProposal.js";
import { buildProviderEditProposalManifest } from "./providerEditProposal.js";
import {
  buildGeneratedEditProposalReview,
  buildProviderEditProposalReview,
  formatEditProposalReviewForPrint,
} from "./editProposalReview.js";

describe("editProposalReview", () => {
  it("renders generated proposals as compact no-write review output", () => {
    const manifest = buildGeneratedEditProposalManifest({
      targets: ["src/app.ts"],
      requestedOperationKind: "exact-fenced-replacement",
      proposedContentStatus: "explicit-new-content",
      exactMappingStatus: "exact-single-target",
    });
    const review = buildGeneratedEditProposalReview(manifest);
    const output = formatEditProposalReviewForPrint(review);

    expect(review.source).toBe("generated");
    expect(review.reviewStatus).toBe("ready-for-selection");
    expect(review.hunkSummaries[0]?.exactMappingReady).toBe(true);
    expect(output).toContain("Proposal review");
    expect(output).toContain("Mutation: not run");
    expect(output).toContain("Raw content: excluded");
    expect(JSON.stringify(review)).not.toContain("status: ready");
  });

  it("renders provider proposal summaries without raw provider content", () => {
    const manifest = buildProviderEditProposalManifest({
      providerKindLabel: "fake-provider",
      targetLabels: ["src/app.ts"],
      proposedOperationKind: "generated-replacement",
      targetSummaries: ["replace selected function"],
      exactReadiness: "review-only",
      riskSummary: "do not expose token=secret",
    });
    const review = buildProviderEditProposalReview(manifest);

    expect(review.source).toBe("provider");
    expect(review.reviewStatus).toBe("review-required");
    expect(review.targetScope).toBe("single");
    expect(review.hunkSummaries[0]?.unsupportedReason).toBe(
      "provider hunk is not exact old/new mapping",
    );
    expect(JSON.stringify(review)).not.toContain("secret");
    expect(review.evidence).toContain("edit-proposal-review:mutation:not-run");
  });
});
