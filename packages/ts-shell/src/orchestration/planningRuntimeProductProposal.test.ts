import { describe, expect, it } from "vitest";

import { buildPlanningMutationHandoffProjection } from "./planningMutationHandoffProjection.js";
import { preparePlanningRuntimeProductProposal } from "./planningRuntimeProductProposal.js";

describe("preparePlanningRuntimeProductProposal", () => {
  it("projects explicit proposal JSON through provider/proposal boundary without provider or apply", async () => {
    const prepared = await preparePlanningRuntimeProductProposal({
      workspaceRoot: process.cwd(),
      handoff: readyHandoff(),
      rawProposal: {
        operationKind: "exact-fenced-replacement",
        targets: [
          {
            path: "src/contextEngine.ts",
            oldText: "old",
            newText: "new",
          },
        ],
      },
    });

    expect(prepared.status).toBe("prepared-exact");
    expect(prepared.providerCalled).toBe(false);
    expect(prepared.providerProposalBoundary.provider.providerCalled).toBe(false);
    expect(prepared.providerProposalBoundary.provider.mode).toBe("default-safe");
    expect(prepared.providerProposalBoundary.proposal.exactness).toBe("exact-ready");
    expect(prepared.providerProposalBoundary.proposal.reviewState).toBe("confirmation-required");
    expect(prepared.providerProposalBoundary.proposal.targetFiles).toEqual(["src/contextEngine.ts"]);
    expect(prepared.providerProposalBoundary.proposal.mutationAuthority).toBe("not-granted");
    expect(prepared.providerProposalBoundary.proposal.applyState).toBe("not-run");
    expect(prepared.providerProposalBoundary.proposal.verificationState).toBe("not-run");
    expect(prepared.evidence).toEqual(
      expect.arrayContaining([
        "planning-runtime-product-proposal:provider-called:false",
        "planning-runtime-product-proposal:provider-boundary:not-run",
        "planning-runtime-product-proposal:proposal-boundary:exact-ready",
      ]),
    );
  });

  it("keeps non-ready handoffs not-run with no provider receipt success", async () => {
    const prepared = await preparePlanningRuntimeProductProposal({
      workspaceRoot: process.cwd(),
      handoff: buildPlanningMutationHandoffProjection({
        editTargets: [],
        missingFacts: ["target file missing"],
        taskKind: "edit-file",
        verificationIntentAvailable: false,
      }),
    });

    expect(prepared.status).toBe("not-run");
    expect(prepared.providerCalled).toBe(false);
    expect(prepared.providerProposalBoundary.provider.readiness).toBe("not-run");
    expect(prepared.providerProposalBoundary.proposal.exactness).toBe("not-run");
    expect(prepared.providerProposalBoundary.proposal.applyState).toBe("not-run");
    expect(prepared.providerProposalBoundary.proposal.verificationState).toBe("not-run");
  });
});

function readyHandoff() {
  return buildPlanningMutationHandoffProjection({
    editTargets: [
      {
        path: "src/contextEngine.ts",
        rationale: "repo score 99; primary-source-name-match",
        handoffRoute: "existing-proof-carrying-mutation-runtime",
        readiness: "ready-for-review",
      },
    ],
    missingFacts: [],
    taskKind: "edit-file",
    verificationIntentAvailable: true,
    expectedChangeSummary: "Prepare a review-only proposal for src/contextEngine.ts.",
  });
}
