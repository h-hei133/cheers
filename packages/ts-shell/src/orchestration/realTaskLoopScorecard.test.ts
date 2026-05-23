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
      confirmationState: "trusted-confirmed",
      applyStatus: "succeeded",
      snapshotRecoveryReady: true,
      verificationStatus: "succeeded",
      repairEligible: false,
      defaultNoProviderNoApply: false,
      mutationScope: "controlled-temp-workspace",
      providerCallDuringApply: false,
    });

    expect(scorecard.providerCall).toBe("pass");
    expect(scorecard.applyResult).toBe("pass");
    expect(scorecard.verification).toBe("pass");
    expect(scorecard.providerCallDuringApply).toBe("pass");
    expect(scorecard.evidence).toContain(
      "real-task-loop-scorecard:mutation-scope:controlled-temp-workspace",
    );
  });

  it("fails if apply would call the provider or misses snapshot recovery", () => {
    const scorecard = buildRealTaskLoopScorecard({
      taskLoopId: "task-loop-unsafe",
      lifecycleReady: true,
      analysisAllowed: true,
      planReady: true,
      providerCalled: true,
      providerExpected: true,
      outputValidationStatus: "valid-exact-hunk-set",
      anchorQuality: "exact-ready",
      confirmationState: "trusted-confirmed",
      applyStatus: "succeeded",
      snapshotRecoveryReady: false,
      verificationStatus: "succeeded",
      repairEligible: false,
      defaultNoProviderNoApply: false,
      mutationScope: "controlled-temp-workspace",
      providerCallDuringApply: true,
    });

    expect(scorecard.snapshotRecovery).toBe("fail");
    expect(scorecard.providerCallDuringApply).toBe("fail");
    expect(scorecard.failureClass).toBe("provider-call-during-apply");
  });
});
