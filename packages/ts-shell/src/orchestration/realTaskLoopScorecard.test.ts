import { describe, expect, it } from "vitest";

import { buildRealTaskLoopScorecard } from "./realTaskLoopScorecard.js";

describe("realTaskLoopScorecard", () => {
  it("scores provider, apply, verification, and controlled mutation scope", () => {
    const scorecard = buildRealTaskLoopScorecard({
      taskLoopId: "task-loop-1",
      lifecycleReady: true,
      analysisAllowed: true,
      planReady: true,
      providerCalled: true,
      providerExpected: true,
      outputValidationStatus: "valid-exact-hunk-set",
      anchorQuality: "exact-ready",
      confirmationState: "confirmed",
      applyStatus: "applied",
      snapshotRecoveryReady: true,
      verificationStatus: "passed",
      repairEligible: false,
      defaultNoProviderNoApply: false,
      mutationScope: "controlled-temp-fixture",
    });

    expect(scorecard.providerCall).toBe("pass");
    expect(scorecard.applyResult).toBe("pass");
    expect(scorecard.verification).toBe("pass");
    expect(scorecard.evidence).toContain(
      "real-task-loop-scorecard:mutation-scope:controlled-temp-fixture",
    );
  });
});
