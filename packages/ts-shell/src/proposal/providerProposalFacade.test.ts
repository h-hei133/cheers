import { describe, expect, it } from "vitest";

import {
  PRODUCT_PROVIDER_PROPOSAL_FACADE_VERSION,
  projectProviderProposalBoundaryFromBridge,
  projectProviderProposalBoundaryFromPreparation,
} from "./providerProposalFacade.js";

describe("providerProposalFacade", () => {
  it("keeps provider-called separate from proposal validity", () => {
    const boundary = projectProviderProposalBoundaryFromPreparation({
      source: "live-provider-proposal",
      status: "live-provider-invalid-format",
      providerCalled: true,
      liveOptIn: true,
      liveEvidenceSource: "live-provider",
      evidence: [
        "planning-runtime-product-proposal:live-provider-primary:provider-called:true",
        "planning-runtime-product-proposal:raw-provider-output-excluded",
      ],
      reason: "Provider output was not a supported exact proposal.",
    });

    expect(boundary.facadeVersion).toBe(PRODUCT_PROVIDER_PROPOSAL_FACADE_VERSION);
    expect(boundary.provider.providerCalled).toBe(true);
    expect(boundary.provider.readiness).toBe("provider-error");
    expect(boundary.proposal.exactness).toBe("invalid");
    expect(boundary.proposal.reviewState).toBe("unsupported");
    expect(boundary.providerCalledIsProposalSuccess).toBe(false);
    expect(boundary.proposal.mutationAuthority).toBe("not-granted");
    expect(boundary.proposal.applyState).toBe("not-run");
    expect(boundary.proposal.verificationState).toBe("not-run");
    expect(boundary.provider.rawOutputStatus).toBe("excluded");
  });

  it("keeps exact-ready proposals review/authority separated", () => {
    const boundary = projectProviderProposalBoundaryFromBridge({
      source: "focused-deterministic-proposal",
      proposalState: "prepared",
      anchorState: "exact-ready",
      confirmationState: "confirmation-required",
      targetFiles: ["src/app.ts"],
    });

    expect(boundary.provider.providerCalled).toBe(false);
    expect(boundary.proposal.exactness).toBe("exact-ready");
    expect(boundary.proposal.reviewState).toBe("confirmation-required");
    expect(boundary.proposal.targetFiles).toEqual(["src/app.ts"]);
    expect(boundary.proposalExactReadyIsAuthority).toBe(false);
    expect(boundary.proposal.mutationAuthority).toBe("not-granted");
    expect(boundary.proposal.applyState).toBe("not-run");
    expect(boundary.proposal.verificationState).toBe("not-run");
  });

  it("classifies review-only and fallback without making either success", () => {
    const boundary = projectProviderProposalBoundaryFromPreparation({
      source: "live-provider-proposal",
      status: "review-only",
      providerCalled: true,
      liveOptIn: true,
      liveEvidenceSource: "fake-provider",
      evidence: [
        "planning-runtime-product-proposal:live-provider-fallback-policy:enabled",
        "planning-runtime-product-proposal:live-provider-attempt:fallback",
        "planning-runtime-product-proposal:live-provider-fallback:provider-called:true",
        "planning-runtime-product-proposal:raw-provider-output-excluded",
      ],
    });

    expect(boundary.provider.mode).toBe("fake-provider");
    expect(boundary.provider.fallbackDecision).toBe("used");
    expect(boundary.proposal.exactness).toBe("review-only");
    expect(boundary.proposal.reviewState).toBe("review-only");
    expect(boundary.reviewOnlyIsApplyReady).toBe(false);
    expect(boundary.proposal.applyState).toBe("not-run");
    expect(boundary.proposal.redactionStatus).toBe("raw-content-excluded");
  });
});
