import { describe, expect, it } from "vitest";
import { buildProviderEditProposalManifest } from "../orchestration/providerEditProposal.js";
import { buildProviderEditProposalReview } from "../orchestration/editProposalReview.js";
import {
  formatCliProposalApplyOutput,
  formatCliProposalReviewOutput,
} from "./cliProposalReviewSurface.js";

describe("cliProposalReviewSurface", () => {
  it("formats proposal review output for print mode without raw content", () => {
    const review = buildProviderEditProposalReview(
      buildProviderEditProposalManifest({
        providerKindLabel: "fake-provider",
        targetLabels: ["src/app.ts"],
        proposedOperationKind: "exact-fenced-replacement",
        targetSummaries: ["replace status without exposing token=secret"],
        exactReadiness: "exact-single-target",
      }),
    );

    const output = formatCliProposalReviewOutput({
      review,
      printMode: true,
    });

    expect(output).toContain("Proposal review");
    expect(output).toContain("Status: ready-for-selection");
    expect(output).toContain("Mutation: not run");
    expect(output).toContain("Raw content: excluded");
    expect(output).not.toContain("secret");
    expect(output.startsWith("\n")).toBe(false);
  });

  it("keeps interactive output framed without changing review text", () => {
    const review = buildProviderEditProposalReview(
      buildProviderEditProposalManifest({
        providerKindLabel: "fake-provider",
        targetLabels: ["src/app.ts"],
        proposedOperationKind: "generated-replacement",
        targetSummaries: ["summary"],
        exactReadiness: "review-only",
      }),
    );

    const output = formatCliProposalReviewOutput({
      review,
      printMode: false,
    });

    expect(output.startsWith("\nProposal review")).toBe(true);
    expect(output.endsWith("\n")).toBe(true);
  });

  it("formats proposal hunk-set apply summaries without raw content", () => {
    const output = formatCliProposalApplyOutput({
      applyResult: {
        status: "hunk-set-applied",
        proposalId: "provider-edit-test",
        source: "provider",
        route: {
          source: "proposal-hunk-set-route",
        } as never,
        changedFiles: ["src/a.ts", "src/b.ts"],
        evidence: ["proposal-hunk-set-route:raw-content-excluded"],
        transcriptSummary:
          "edit-proposal-apply proposal=provider-edit-test; hunkSet=proposal-hunk-set-test; raw-content-excluded",
      },
      printMode: true,
    });

    expect(output).toContain("Proposal apply");
    expect(output).toContain("Status: hunk-set-applied");
    expect(output).toContain("Route: proposal hunk-set");
    expect(output).toContain("Raw content: excluded");
    expect(output).not.toContain("status: ready");
  });
});
