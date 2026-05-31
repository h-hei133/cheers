import { describe, expect, it } from "vitest";

import { buildPlanningMutationHandoffProjection } from "../planning/handoff/mutation.js";
import { buildPlanningMutationProposalBridge } from "../planning/handoff/bridge.js";

describe("buildPlanningMutationProposalBridge", () => {
  it("consumes a structured planning handoff as proposal-prepared without anchoring or writes by default", () => {
    const bridge = buildPlanningMutationProposalBridge({
      requestId: "route209-default",
      handoff: readyHandoff(),
    });

    expect(bridge.state).toBe("proposal-prepared");
    expect(bridge.proposalState).toBe("prepared");
    expect(bridge.anchorState).toBe("missing-exact-mapping");
    expect(bridge.confirmationState).toBe("review-required");
    expect(bridge.providerCall).toBe("not-run");
    expect(bridge.providerProposalBoundary.provider.providerCalled).toBe(false);
    expect(bridge.providerProposalBoundary.proposal.exactness).toBe("review-only");
    expect(bridge.providerProposalBoundary.proposal.reviewState).toBe("review-only");
    expect(bridge.providerProposalBoundary.proposal.applyState).toBe("not-run");
    expect(bridge.applyState).toBe("not-run");
    expect(bridge.verificationState).toBe("not-run");
    expect(bridge.evidenceSource).toBe("planning-handoff-summary");
    expect(bridge.orchestration).toMatchObject({
      proposalSource: "planning-handoff-summary",
      operationType: "review-only-generated",
      targetFiles: ["src/contextEngine.ts"],
      anchorQuality: "missing-exact-mapping",
      handoffReadiness: "ready-for-review",
      authorityRequired: true,
      mutationAuthority: "not-granted",
      applyState: "not-run",
      verificationState: "not-run",
    });
    expect(bridge.orchestration.notProvenClaims).toEqual(
      expect.arrayContaining(["exact anchor", "apply authority", "apply executed", "verification executed"]),
    );
    expect(bridge.proposalId).toMatch(/^generated-edit-/);
    expect(bridge.proposalReviewStatus).toBe("review-required");
    expect(bridge.evidence).toEqual(
      expect.arrayContaining([
        "planning-proposal-bridge:state:proposal-prepared",
        "planning-proposal-bridge:proposal:prepared",
        "planning-proposal-bridge:anchor:missing-exact-mapping",
        "planning-proposal-bridge:confirmation:review-required",
        "planning-proposal-bridge:operation:review-only-generated",
        "planning-proposal-bridge:handoff-readiness:ready-for-review",
        "planning-proposal-bridge:authority-required:true",
        "planning-proposal-bridge:provider-call:not-run",
        "planning-proposal-bridge:provider-boundary:not-run",
        "planning-proposal-bridge:proposal-boundary:review-only",
        "planning-proposal-bridge:apply:not-run",
        "planning-proposal-bridge:verification:not-run",
        "planning-proposal-bridge:mutation-authority:not-granted",
        "planning-proposal-bridge:proposal-review-consumed",
      ]),
    );
  });

  it("uses existing anchoring infrastructure for focused exact proposals and stops at confirmation-required", () => {
    const bridge = buildPlanningMutationProposalBridge({
      requestId: "route209-exact",
      handoff: readyHandoff(),
      rawProposal: {
        operationKind: "exact-fenced-replacement",
        targets: [
          {
            path: "src/contextEngine.ts",
            oldText: "  return rankTarget(task);",
            newText: "  return rankTarget(task.trim());",
          },
        ],
        verificationPlan: ["npm test -- --help"],
      },
      currentContentByTargetPath: new Map([
        ["src/contextEngine.ts", "export function run(task: string) {\n  return rankTarget(task);\n}\n"],
      ]),
    });

    expect(bridge.state).toBe("confirmation-required");
    expect(bridge.anchorState).toBe("exact-ready");
    expect(bridge.confirmationState).toBe("confirmation-required");
    expect(bridge.anchoredProposal?.handoffReadiness).toBe("exact-single-target");
    expect(bridge.anchoredReview?.reviewStatus).toBe("ready-for-selection");
    expect(bridge.providerCall).toBe("not-run");
    expect(bridge.providerProposalBoundary.proposal.exactness).toBe("exact-ready");
    expect(bridge.providerProposalBoundary.proposal.mutationAuthority).toBe("not-granted");
    expect(bridge.providerProposalBoundary.proposal.applyState).toBe("not-run");
    expect(bridge.providerProposalBoundary.proposal.verificationState).toBe("not-run");
    expect(bridge.applyState).toBe("not-run");
    expect(bridge.verificationState).toBe("not-run");
    expect(bridge.evidenceSource).toBe("focused-deterministic-proposal");
    expect(bridge.orchestration).toMatchObject({
      proposalSource: "focused-deterministic-proposal",
      operationType: "update-existing-file",
      targetFiles: ["src/contextEngine.ts"],
      anchorQuality: "exact-ready",
      handoffReadiness: "ready-for-apply-after-authority",
      authorityRequired: true,
      mutationAuthority: "not-granted",
      applyState: "not-run",
      verificationState: "not-run",
    });
    expect(bridge.orchestration.notProvenClaims).toEqual(
      expect.arrayContaining(["explicit authority not granted", "apply executed", "verification executed"]),
    );
    expect(bridge.evidence).toEqual(
      expect.arrayContaining([
        "planning-proposal-bridge:existing-anchoring-infrastructure-consumed",
        "planning-proposal-bridge:operation:update-existing-file",
        "planning-proposal-bridge:handoff-readiness:ready-for-apply-after-authority",
        "planning-proposal-bridge:authority-required:true",
        "provider-output-validation:status:valid-exact-single-target",
        "provider-anchor-extraction:status:exact-candidates",
        "provider-anchor-match:outcome:exact-match",
        "provider-anchor-conflict:kind:none",
        "provider-anchor-quality:level:exact-ready",
        "provider-anchored-proposal:handoff:exact-single-target",
        "edit-proposal-review:status:ready-for-selection",
        "planning-proposal-bridge:provider-call:not-run",
        "planning-proposal-bridge:apply:not-run",
      ]),
    );
  });

  it("does not prepare proposals from missing-context handoffs", () => {
    const bridge = buildPlanningMutationProposalBridge({
      requestId: "route209-missing-context",
      handoff: buildPlanningMutationHandoffProjection({
        editTargets: [
          {
            path: "src/contextEngine.ts",
            rationale: "selected by stale memory",
            handoffRoute: "existing-proof-carrying-mutation-runtime",
            readiness: "needs-more-context",
          },
        ],
        missingFacts: ["call-site context missing"],
        taskKind: "edit-file",
        verificationIntentAvailable: false,
      }),
    });

    expect(bridge.state).toBe("missing-context");
    expect(bridge.proposalState).toBe("not-run");
    expect(bridge.anchorState).toBe("not-run");
    expect(bridge.confirmationState).toBe("not-requested");
    expect(bridge.orchestration.handoffReadiness).toBe("blocked");
    expect(bridge.evidence).toContain("planning-proposal-bridge:handoff-not-ready");
    expect(bridge.evidence).toContain("planning-proposal-bridge:proposal:not-run");
  });

  it("labels invalid focused proposals unsupported without provider, apply, or verification", () => {
    const bridge = buildPlanningMutationProposalBridge({
      requestId: "route209-invalid",
      handoff: readyHandoff(),
      rawProposal: {
        operationKind: "broad-refactor",
        targets: [
          {
            path: "src/contextEngine.ts",
            oldText: "rankTarget(task)",
            newText: "rankEveryTarget(task)",
          },
        ],
      },
      currentContentByTargetPath: new Map([
        ["src/contextEngine.ts", "return rankTarget(task);\n"],
      ]),
    });

    expect(bridge.state).toBe("unsupported");
    expect(bridge.proposalState).toBe("invalid");
    expect(bridge.anchorState).toBe("blocked");
    expect(bridge.confirmationState).toBe("unsupported");
    expect(bridge.providerCall).toBe("not-run");
    expect(bridge.applyState).toBe("not-run");
    expect(bridge.verificationState).toBe("not-run");
    expect(bridge.orchestration).toMatchObject({
      operationType: "broad-refactor-preview",
      handoffReadiness: "unsupported",
      mutationAuthority: "not-granted",
      applyState: "not-run",
      verificationState: "not-run",
    });
    expect(bridge.evidence).toEqual(
      expect.arrayContaining([
        "planning-proposal-bridge:state:unsupported",
        "planning-proposal-bridge:proposal:invalid",
        "provider-output-validation:status:broad-refactor-output",
        "provider-anchored-proposal:handoff:blocked",
        "planning-proposal-bridge:provider-call:not-run",
        "planning-proposal-bridge:apply:not-run",
        "planning-proposal-bridge:verification:not-run",
      ]),
    );
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
    contextReceipts: [
      {
        id: "context-receipt:ctx_mem_123:1",
        path: "src/contextEngine.ts",
        summary: "context engine source summary",
        relevance: "target file",
      },
    ],
    readEvidence: [
      {
        id: "read-evidence:context_engine_123:1",
        path: "src/contextEngine.ts",
        reason: "target file",
        source: "repo-intelligence",
      },
    ],
    expectedChangeSummary: "Prepare a review-only proposal for src/contextEngine.ts.",
    verificationIntentSummary: "verificationPlan=verification_plan_123; command=npm test -- --help; command-dispatch=not-run",
    verificationEvidenceIds: ["verification_plan_123"],
  });
}
