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

  it("records provider dry-run prompt output anchor redaction and no-write scores", () => {
    const scorecard = buildHarnessScorecard({
      providerDryRun: {
        promptAuditStatus: "pass",
        outputValidationStatus: "partial-anchor",
        anchorQualityLevel: "needs-anchoring",
        anchoringOutcome: "partial-anchors-review-only",
        anchoredProposalId: "provider-anchored-194",
        anchoringReviewReadiness: "review-only",
        anchoringNoWrite: true,
        redactionStatus: "redacted-and-budgeted",
        noWrite: true,
      },
    });

    expect(scorecard.providerDryRunPromptReadiness).toBe("pass");
    expect(scorecard.providerDryRunOutputValidity).toBe("warn");
    expect(scorecard.providerDryRunAnchorQuality).toBe("warn");
    expect(scorecard.providerAnchoringReadiness).toBe("warn");
    expect(scorecard.providerAnchoringNoWrite).toBe("pass");
    expect(scorecard.providerDryRunRedaction).toBe("pass");
    expect(scorecard.providerDryRunNoWrite).toBe("pass");
    expect(scorecard.evidence).toEqual(
      expect.arrayContaining([
        "harness-scorecard:provider-dry-run-prompt:pass",
        "harness-scorecard:provider-dry-run-output:warn",
        "harness-scorecard:provider-dry-run-anchor:warn",
        "harness-scorecard:provider-anchoring:warn",
        "harness-scorecard:provider-anchored-proposal:provider-anchored-194",
        "harness-scorecard:provider-anchoring-no-write:pass",
        "harness-scorecard:provider-dry-run-redaction:pass",
        "harness-scorecard:provider-dry-run-no-write:pass",
      ]),
    );
  });
});
