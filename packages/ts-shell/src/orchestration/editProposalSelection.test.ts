import { describe, expect, it } from "vitest";
import { buildProviderEditProposalManifest } from "./providerEditProposal.js";
import { buildProviderEditProposalReview } from "./editProposalReview.js";
import { selectEditProposalHunks } from "./editProposalSelection.js";

describe("editProposalSelection", () => {
  it("rejects proposals no-write", () => {
    const review = buildProviderEditProposalReview(
      buildProviderEditProposalManifest({
        providerKindLabel: "fake-provider",
        targetLabels: ["src/app.ts"],
        proposedOperationKind: "exact-fenced-replacement",
        targetSummaries: ["summary"],
        exactReadiness: "exact-single-target",
      }),
    );

    const selection = selectEditProposalHunks({
      review,
      action: "reject-proposal",
    });

    expect(selection.state).toBe("rejected");
    expect(selection.selectedHunks).toEqual([]);
    expect(selection.mutationAuthority).toBe("not-granted");
    expect(selection.evidence).toContain("edit-proposal-selection:mutation:not-run");
  });

  it("requires explicit confirmation before exact selection can apply", () => {
    const review = buildProviderEditProposalReview(
      buildProviderEditProposalManifest({
        providerKindLabel: "fake-provider",
        targetLabels: ["src/app.ts"],
        proposedOperationKind: "exact-fenced-replacement",
        targetSummaries: ["summary"],
        exactReadiness: "exact-single-target",
      }),
    );

    const unconfirmed = selectEditProposalHunks({
      review,
      action: "select-all-exact",
    });
    expect(unconfirmed.state).toBe("selection-required");

    const confirmed = selectEditProposalHunks({
      review,
      action: "select-all-exact",
      explicitConfirmation: true,
    });
    expect(confirmed.state).toBe("confirmed-exact-single-target");
    expect(confirmed.selectedTargetLabels).toEqual(["src/app.ts"]);
  });

  it("keeps non-exact hunks review-only and guards max target-set size", () => {
    const nonExact = buildProviderEditProposalReview(
      buildProviderEditProposalManifest({
        providerKindLabel: "fake-provider",
        targetLabels: ["src/app.ts"],
        proposedOperationKind: "generated-replacement",
        targetSummaries: ["summary"],
        exactReadiness: "review-only",
      }),
    );
    expect(
      selectEditProposalHunks({
        review: nonExact,
        action: "select-one-target",
        targetLabels: ["src/app.ts"],
        explicitConfirmation: true,
      }).state,
    ).toBe("unsupported-for-apply");

    const targetSet = buildProviderEditProposalReview(
      buildProviderEditProposalManifest({
        providerKindLabel: "fake-provider",
        targetLabels: ["a.ts", "b.ts", "c.ts"],
        proposedOperationKind: "exact-fenced-replacement",
        targetSummaries: ["a", "b", "c"],
        exactReadiness: "exact-target-set",
      }),
    );
    const overMax = selectEditProposalHunks({
      review: targetSet,
      action: "select-all-exact",
      explicitConfirmation: true,
      maxFiles: 2,
    });
    expect(overMax.state).toBe("invalid-selection");
    expect(overMax.evidence).toContain("edit-proposal-selection:over-max-files");
  });
});
