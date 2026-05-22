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

  it("records anchored provider smoke mode case skip called status quality and no-write", () => {
    const scorecard = buildHarnessScorecard({
      providerSmoke: {
        mode: "real-provider-smoke",
        providerKind: "openai-compatible",
        adapterApproved: false,
        caseId: "exact-single-target",
        skipReason: "no-opt-in",
        reportId: "proposal_quality_report_196",
        providerCalled: false,
        providerErrorClass: "none",
        outputValidationStatus: "none",
        anchorQuality: "none",
        noWriteStatus: "pass",
        scorecardStatus: "skip",
      },
    });

    expect(scorecard.providerSmokeMode).toBe("real-provider-smoke");
    expect(scorecard.providerSmokeProviderKind).toBe("openai-compatible");
    expect(scorecard.providerSmokeAdapterApproved).toBe(false);
    expect(scorecard.providerSmokeCaseId).toBe("exact-single-target");
    expect(scorecard.providerSmokeSkipReason).toBe("no-opt-in");
    expect(scorecard.providerSmokeProviderCalled).toBe(false);
    expect(scorecard.providerSmokeProviderErrorClass).toBe("none");
    expect(scorecard.providerSmokeOutputValidation).toBe("none");
    expect(scorecard.providerSmokeAnchorQuality).toBe("none");
    expect(scorecard.providerSmokeNoWrite).toBe("pass");
    expect(scorecard.providerSmokeQuality).toBe("skip");
    expect(scorecard.evidence).toEqual(
      expect.arrayContaining([
        "harness-scorecard:provider-smoke-mode:real-provider-smoke",
        "harness-scorecard:provider-smoke-provider:openai-compatible",
        "harness-scorecard:provider-smoke-adapter-approved:false",
        "harness-scorecard:provider-smoke-case:exact-single-target",
        "harness-scorecard:provider-smoke-skip:no-opt-in",
        "harness-scorecard:provider-smoke-called:false",
        "harness-scorecard:provider-smoke-error:none",
        "harness-scorecard:provider-smoke-output:none",
        "harness-scorecard:provider-smoke-anchor:none",
        "harness-scorecard:provider-smoke-no-write:pass",
        "harness-scorecard:provider-smoke-quality:skip",
      ]),
    );
  });
});
