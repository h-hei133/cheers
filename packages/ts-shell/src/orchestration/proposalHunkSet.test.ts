import { describe, expect, it } from "vitest";
import { buildProviderEditProposalManifest } from "./providerEditProposal.js";
import { buildProviderEditProposalReview } from "./editProposalReview.js";
import { selectEditProposalHunks } from "./editProposalSelection.js";
import { buildProposalHunkSetManifest } from "./proposalHunkSet.js";

describe("proposalHunkSet", () => {
  it("builds a raw-content-excluded manifest for selected exact proposal hunks", () => {
    const review = buildProviderEditProposalReview(
      buildProviderEditProposalManifest({
        providerKindLabel: "fake-provider",
        targetLabels: ["src/a.ts", "src/b.ts"],
        proposedOperationKind: "exact-fenced-replacement",
        targetSummaries: ["exact edit for a", "exact edit for b"],
        exactReadiness: "exact-target-set",
      }),
    );
    const selection = selectEditProposalHunks({
      review,
      action: "select-all-exact",
      explicitConfirmation: true,
    });
    const manifest = buildProposalHunkSetManifest({
      selection,
      mappingByHunkId: new Map(
        selection.selectedHunks.map((hunk) => [
          hunk.hunkId,
          {
            oldText: "draft",
            newText: "ready",
            source: "old-new-fenced-blocks" as const,
          },
        ]),
      ),
    });

    expect(manifest.hunkSetId).toMatch(/^proposal-hunk-set-/);
    expect(manifest.sourceProposalId).toBe(selection.proposalId);
    expect(manifest.selectedTargetPaths).toEqual(["src/a.ts", "src/b.ts"]);
    expect(manifest.selectedHunks.map((hunk) => hunk.exactMappingStatus)).toEqual([
      "exact",
      "exact",
    ]);
    expect(manifest.mutationAuthority).toBe("not-granted");
    expect(JSON.stringify(manifest)).not.toContain("ready");
    expect(manifest.evidence).toContain("proposal-hunk-set:raw-content-excluded");
  });
});
