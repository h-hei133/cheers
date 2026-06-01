import { describe, expect, it } from "vitest";

import type { RepairVerdictTerminalProjection } from "../../result/projection/repair/verdict.js";
import {
  createLoopFinalizationInput,
  createProductLoopCloseoutInput,
  decideLoopFinalization,
  projectProductLoopCloseout,
} from "./finalization.js";

describe("loop finalization decision", () => {
  it("produces stop_complete only for result-owned verified repair projection", () => {
    const input = createLoopFinalizationInput({
      resultProjection: projection(),
    });
    const decision = decideLoopFinalization({ finalizationInput: input });

    expect(input).toMatchObject({
      resultTerminalStatus: "verified_with_repair",
      proofComplete: true,
      originalFailurePreserved: true,
      repairApplyPreserved: true,
      postRepairVerificationPreserved: true,
      terminalSuccessClaim: false,
    });
    expect(decision).toMatchObject({
      decision: "stop_complete",
      pendingUserAuthority: false,
      pendingVerification: false,
      pendingRepair: false,
      originalFailureClass: "test-failed",
      missingProofItems: [],
      terminalSuccessClaim: false,
    });
    expect(decision.notProvenClaims).toContain("loop-decision-is-not-terminal-truth");
  });

  it("does not stop complete for partial, blocked, failed, or not proven projections", () => {
    const statuses = ["partial", "blocked", "failed", "not_proven"] as const;
    const decisions = statuses.map((status) =>
      decideLoopFinalization({
        finalizationInput: createLoopFinalizationInput({
          resultProjection: projection({
            status,
            terminalClassification: "stopped",
            missingProofItems: status === "blocked"
              ? ["repair-authority"]
              : ["post-repair-verification"],
          }),
        }),
      }).decision
    );

    expect(decisions).not.toContain("stop_complete");
    expect(decisions).toEqual([
      "continue_verification",
      "await_user",
      "continue_verification",
      "continue_verification",
    ]);
  });

  it("routes missing authority to await_user and missing repair to continue_repair", () => {
    const awaitUser = decideLoopFinalization({
      finalizationInput: createLoopFinalizationInput({
        resultProjection: projection({
          status: "partial",
          terminalClassification: "stopped",
          missingProofItems: ["repair-authority"],
        }),
      }),
    });
    const continueRepair = decideLoopFinalization({
      finalizationInput: createLoopFinalizationInput({
        resultProjection: projection({
          status: "partial",
          terminalClassification: "stopped",
          missingProofItems: ["repair-apply"],
        }),
      }),
    });

    expect(awaitUser.decision).toBe("await_user");
    expect(awaitUser.sessionCarryForwardFacts).toContain("pending-user-authority:yes");
    expect(continueRepair.decision).toBe("continue_repair");
    expect(continueRepair.sessionCarryForwardFacts).toContain("pending-repair:yes");
    expect(JSON.stringify([awaitUser, continueRepair])).not.toContain('"success":true');
  });

  it("projects complete closeout only from result-owned verified status plus stop complete", () => {
    const resultProjection = projection();
    const finalizationInput = createLoopFinalizationInput({ resultProjection });
    const decision = decideLoopFinalization({ finalizationInput });
    const closeoutInput = createProductLoopCloseoutInput({
      resultProjection,
      loopDecision: decision,
    });
    const closeout = projectProductLoopCloseout({ closeoutInput });

    expect(closeout).toMatchObject({
      status: "complete",
      complete: true,
      resultOwnedTerminalStatus: "verified_with_repair",
      loopOwnedControlDecision: "stop_complete",
      terminalSuccessClaim: false,
    });
    expect(closeout.sessionCarryForwardFacts).toEqual(
      expect.arrayContaining([
        "product-closeout-status:complete",
        "result-owned-terminal-status:verified_with_repair",
        "loop-owned-control-decision:stop_complete",
        "original-failure:verification:failed",
      ]),
    );
    expect(closeout.notProvenClaims).toContain(
      "product-closeout-is-not-terminal-truth",
    );
  });

  it("keeps incomplete closeout states separate from complete", () => {
    const resultProjection = projection({
      status: "partial",
      terminalClassification: "stopped",
      missingProofItems: ["post-repair-verification"],
    });
    const finalizationInput = createLoopFinalizationInput({ resultProjection });
    const decision = decideLoopFinalization({ finalizationInput });
    const closeout = projectProductLoopCloseout({
      closeoutInput: createProductLoopCloseoutInput({
        resultProjection,
        loopDecision: decision,
      }),
    });

    expect(closeout.status).toBe("continue_verification");
    expect(closeout.complete).toBe(false);
    expect(closeout.resultOwnedTerminalStatus).toBe("partial");
    expect(closeout.loopOwnedControlDecision).toBe("continue_verification");
    expect(closeout.missingProofItems).toContain("post-repair-verification");
    expect(closeout.notProvenClaims).toContain("incomplete-closeout-is-not-success");
  });
});

function projection(
  overrides: Partial<RepairVerdictTerminalProjection> = {},
): RepairVerdictTerminalProjection {
  return {
    projectionId: "projection:repair",
    sourceProofInputId: "proof:repair",
    status: "verified_with_repair",
    terminalClassification: "success",
    productVerdict: {
      status: "COMPLETE",
      terminalClassification: "success",
      reason: "result owner verified repair",
      provenance: { source: "product-runtime", adapter: "repair-verdict" },
      redaction: "raw-content-excluded",
      cleanup: "not-applicable",
      notProvenReasons: [],
      partialReasons: [],
      blockedReasons: [],
    },
    originalVerificationFailureId: "verification:failed",
    originalFailureClass: "test-failed",
    originalFailureStatus: "failed",
    originalReceiptIds: ["receipt-original"],
    repairProposalId: "repair:proposal",
    repairAuthorityState: "granted",
    repairApplyState: "applied",
    repairTouchedTargetSummaries: ["src/app.ts"],
    repairApplyReceiptIds: ["receipt-apply"],
    postRepairVerificationState: "passed",
    postRepairRelevanceStatus: "task_relevant",
    postRepairCoverageStatus: "covered",
    postRepairReceiptIds: ["receipt-post"],
    missingProofItems: [],
    notProvenClaims: ["result-owner-terminal-projection"],
    terminalSuccessClaim: false,
    ...overrides,
  };
}
