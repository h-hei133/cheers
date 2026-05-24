import { describe, expect, it } from "vitest";

import { buildPlanningMutationHandoffProjection } from "./planningMutationHandoffProjection.js";

describe("buildPlanningMutationHandoffProjection", () => {
  it("turns a selected edit target into a no-write proposal review envelope", () => {
    const projection = buildPlanningMutationHandoffProjection({
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

    expect(projection.handoffId).toMatch(/^planning-mutation-handoff-/);
    expect(projection.handoffState).toBe("handoff-ready");
    expect(projection.readiness).toBe("review-ready");
    expect(projection.backendLane).toBe("generated-edit-proposal-review-only");
    expect(projection.backendConsumption).toBe("not-run");
    expect(projection.executionLane).toBe("existing-exact-fenced-route");
    expect(projection.reviewState).toBe("review-required");
    expect(projection.permissionState).toBe("not-requested");
    expect(projection.targetPaths).toEqual(["src/contextEngine.ts"]);
    expect(projection.contextReceiptIds).toEqual(["context-receipt:ctx_mem_123:1"]);
    expect(projection.readEvidenceIds).toEqual(["read-evidence:context_engine_123:1"]);
    expect(projection.expectedChangeSummary).toBe("Prepare a review-only proposal for src/contextEngine.ts.");
    expect(projection.verificationIntent).toEqual({
      available: true,
      summary: "verificationPlan=verification_plan_123; command=npm test -- --help; command-dispatch=not-run",
      evidenceIds: ["verification_plan_123"],
    });
    expect(projection.unsupportedReasons).toEqual([]);
    expect(projection.targets[0]).toMatchObject({
      path: "src/contextEngine.ts",
      relevantContextReceiptIds: ["context-receipt:ctx_mem_123:1"],
      readEvidenceIds: ["read-evidence:context_engine_123:1"],
      expectedChangeSummary: "Prepare a review-only proposal for src/contextEngine.ts.",
      verificationIntentSummary: "verificationPlan=verification_plan_123; command=npm test -- --help; command-dispatch=not-run",
      unsupportedReasons: [],
    });
    expect(projection.proposalId).toMatch(/^generated-edit-/);
    expect(projection.proposal?.mutationAuthority).toBe("not-granted");
    expect(projection.proposal?.redactionStatus).toBe("raw-content-excluded");
    expect(projection.proposalReview).toMatchObject({
      reviewStatus: "review-required",
      exactMappingReadiness: "missing",
      redactionStatus: "raw-content-excluded",
    });
    expect(projection.requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "selected-target",
          status: "available-for-review",
          owner: "planning-runtime",
        }),
        expect.objectContaining({
          id: "exact-old-new-mapping",
          status: "missing-before-execution",
          owner: "reviewer",
        }),
        expect.objectContaining({
          id: "explicit-target-confirmation",
          status: "missing-before-execution",
          owner: "reviewer",
        }),
        expect.objectContaining({
          id: "workspace-authority",
          status: "required-by-existing-route",
          owner: "existing-mutation-route",
        }),
        expect.objectContaining({
          id: "final-stale-read",
          status: "required-by-existing-route",
          owner: "existing-mutation-route",
        }),
        expect.objectContaining({
          id: "snapshot-receipt",
          status: "required-by-existing-route",
          owner: "existing-mutation-route",
        }),
        expect.objectContaining({
          id: "post-write-verification",
          status: "available-for-review",
          owner: "existing-mutation-route",
        }),
        expect.objectContaining({
          id: "claim-ledger-verdict",
          status: "required-by-existing-route",
          owner: "claim-ledger",
        }),
      ]),
    );
    expect(projection.evidence).toEqual(
      expect.arrayContaining([
        "planning-mutation-handoff:projection-created",
        expect.stringMatching(/^planning-mutation-handoff:id:planning-mutation-handoff-/),
        "planning-mutation-handoff:structured-contract:v1",
        "planning-mutation-handoff:state:handoff-ready",
        "planning-mutation-handoff:readiness:review-ready",
        "planning-mutation-handoff:context-receipts:1",
        "planning-mutation-handoff:read-evidence:1",
        "planning-mutation-handoff:verification-intent:available",
        "planning-mutation-handoff:backend-lane:generated-edit-proposal-review-only",
        "planning-mutation-handoff:backend-consumption:not-run",
        "planning-mutation-handoff:execution-lane:existing-exact-fenced-route",
        "planning-mutation-handoff:permission:not-requested",
        "planning-mutation-handoff:mutation-authority:not-granted",
        "planning-mutation-handoff:provider-call:not-run",
        "planning-mutation-handoff:apply:not-run",
        "planning-mutation-handoff:command-dispatch:not-run",
        "planning-mutation-handoff:raw-content-excluded",
        "generated-edit-proposal:mutation-authority:not-granted",
        "generated-edit-proposal:raw-content-excluded",
        "edit-proposal-review:status:review-required",
        "edit-proposal-review:readiness:missing",
        "edit-proposal-review:mutation:not-run",
      ]),
    );
  });

  it("keeps read-only planning tasks blocked with no proposal", () => {
    const projection = buildPlanningMutationHandoffProjection({
      editTargets: [],
      missingFacts: [],
      taskKind: "repo-explain",
      verificationIntentAvailable: true,
    });

    expect(projection.readiness).toBe("blocked");
    expect(projection.handoffState).toBe("planning-only");
    expect(projection.backendLane).toBe("none");
    expect(projection.executionLane).toBe("none");
    expect(projection.targetPaths).toEqual([]);
    expect(projection.proposal).toBeUndefined();
    expect(projection.proposalReview).toBeUndefined();
    expect(projection.blockedReasons).toEqual([
      "read-only planning task selected no mutation target",
    ]);
    expect(projection.unsupportedReasons).toEqual([
      "read-only planning task selected no mutation target",
    ]);
    expect(projection.reason).toContain("Read-only planning path");
    expect(projection.requirements).toContainEqual(
      expect.objectContaining({
        id: "selected-target",
        status: "not-applicable",
      }),
    );
    expect(projection.evidence).toContain(
      "planning-mutation-handoff:readiness:blocked",
    );
  });

  it("does not mark targets review-ready while missing facts block planning", () => {
    const projection = buildPlanningMutationHandoffProjection({
      editTargets: [
        {
          path: "src/app.ts",
          rationale: "selected by stale memory",
          handoffRoute: "existing-proof-carrying-mutation-runtime",
          readiness: "needs-more-context",
        },
      ],
      missingFacts: ["call-site context missing"],
      taskKind: "edit-file",
      verificationIntentAvailable: false,
    });

    expect(projection.readiness).toBe("blocked");
    expect(projection.handoffState).toBe("missing-context");
    expect(projection.backendLane).toBe("none");
    expect(projection.executionLane).toBe("none");
    expect(projection.targetPaths).toEqual(["src/app.ts"]);
    expect(projection.proposal).toBeUndefined();
    expect(projection.blockedReasons).toContain("call-site context missing");
    expect(projection.targets[0]?.unsupportedReasons).toContain("call-site context missing");
    expect(projection.requirements).toContainEqual(
      expect.objectContaining({
        id: "exact-old-new-mapping",
        status: "not-applicable",
      }),
    );
    expect(projection.reason).toContain("needs more grounded context");
  });

  it("maps multiple selected targets to the existing target-set lane after review inputs", () => {
    const projection = buildPlanningMutationHandoffProjection({
      editTargets: [
        {
          path: "src/app.ts",
          rationale: "source candidate",
          handoffRoute: "existing-proof-carrying-mutation-runtime",
          readiness: "ready-for-review",
        },
        {
          path: "src/app.test.ts",
          rationale: "adjacent test candidate",
          handoffRoute: "existing-proof-carrying-mutation-runtime",
          readiness: "ready-for-review",
        },
      ],
      missingFacts: [],
      taskKind: "edit-file",
      verificationIntentAvailable: true,
    });

    expect(projection.readiness).toBe("review-ready");
    expect(projection.backendLane).toBe("generated-edit-proposal-review-only");
    expect(projection.executionLane).toBe("existing-target-set-route");
    expect(projection.proposalReview?.targetScope).toBe("target-set");
    expect(projection.evidence).toContain(
      "planning-mutation-handoff:execution-lane:existing-target-set-route",
    );
  });
});
