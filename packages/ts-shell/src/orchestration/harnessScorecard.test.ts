import { describe, expect, it } from "vitest";
import { buildHarnessScorecard } from "./harnessScorecard.js";
import { buildHarnessTrace } from "./harnessTrace.js";

describe("harnessScorecard", () => {
  it("summarizes pass warn fail skip deterministically", () => {
    const trace = buildHarnessTrace({
      planQualityId: "plan_quality_188",
      status: "provider not configured",
    });
    const scorecard = buildHarnessScorecard({
      trace,
      providerProposalReady: false,
      verificationReady: true,
      resultTruthful: true,
    });

    expect(scorecard.contextQuality).toBe("skip");
    expect(scorecard.providerProposalReadiness).toBe("fail");
    expect(scorecard.verificationReadiness).toBe("pass");
    expect(scorecard.repairReadiness).toBe("skip");
    expect(scorecard.failureClass).toBe("provider-unavailable");
    expect(scorecard.evidence).toContain("harness-scorecard:raw-content-excluded");
  });
});
