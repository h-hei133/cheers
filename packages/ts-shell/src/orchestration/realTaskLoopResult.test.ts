import { describe, expect, it } from "vitest";

import { createRealTaskLoopFixture, removeRealTaskLoopFixture } from "./realTaskLoopFixture.js";
import { buildRealTaskLoopPlan } from "./realTaskLoopPlan.js";
import { buildRealTaskLoopResult } from "./realTaskLoopResult.js";
import { buildRealTaskLoopScorecard } from "./realTaskLoopScorecard.js";

describe("realTaskLoopResult", () => {
  it("builds replay-safe session evidence without raw provider output", () => {
    const fixture = createRealTaskLoopFixture({ fixtureId: "result-test" });
    try {
      const plan = buildRealTaskLoopPlan({
        fixtureId: fixture.fixtureId,
        providerKind: "none",
        confirmationState: "not-requested",
        state: "provider-skipped",
      });
      const scorecard = buildRealTaskLoopScorecard({
        taskLoopId: plan.taskLoopId,
        lifecycleReady: false,
        analysisAllowed: false,
        planReady: false,
        providerCalled: false,
        providerExpected: false,
        confirmationState: "not-requested",
        applyStatus: "not-run",
        snapshotRecoveryReady: false,
        verificationStatus: "not-run",
        repairEligible: false,
        defaultNoProviderNoApply: true,
        mutationScope: "none",
      });
      const result = buildRealTaskLoopResult({
        fixture,
        plan,
        scorecard,
        liveOptIn: false,
        confirmApply: false,
      });

      expect(result.sessionEvidence).toContain("real-task-loop-session:provider-called:false");
      expect(result.sessionEvidence).toContain("real-task-loop-session:provider-call-during-apply:false");
      expect(result.output).toContain("Raw provider output: excluded");
    } finally {
      removeRealTaskLoopFixture(fixture);
    }
  });
});
