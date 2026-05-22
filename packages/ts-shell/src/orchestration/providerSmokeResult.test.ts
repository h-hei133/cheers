import { describe, expect, it } from "vitest";

import { buildProviderSmokeResult } from "./providerSmokeResult.js";
import { buildProposalQualityReport } from "./proposalQualityReport.js";
import { evaluateAnchoredProviderSmokeGate } from "./anchoredProviderSmokeGate.js";

describe("providerSmokeResult", () => {
  it("formats no-opt-in skip result without mutation or raw output", () => {
    const gate = evaluateAnchoredProviderSmokeGate({
      requestId: "route196-result",
      mode: "real-provider",
      explicitSmokeOptIn: false,
      providerAvailability: { kind: "available", providerKindLabel: "fake-real-provider" },
      lifecycleId: "life_196",
      analysisBriefId: "analysis_196",
      analysisQualityId: "analysis_quality_196",
      analysisQualityDecision: "allow",
      planQualityId: "plan_quality_196",
      planQualityLevel: "ready",
      promptAuditStatus: "pass",
      dryRunMode: "no-write",
      redactionStatus: "redacted-and-budgeted",
    });
    const report = buildProposalQualityReport({
      runId: "route196_result",
      mode: "real-provider-smoke",
      gate,
    });
    const result = buildProviderSmokeResult({ runId: "route196_result", reports: [report] });

    expect(result.status).toBe("real-provider-smoke-skipped-no-opt-in");
    expect(result.providerCalled).toBe(false);
    expect(result.changedFiles).toEqual([]);
    expect(result.mutationAuthority).toBe("not-granted");
    expect(result.output).toContain("Raw provider output: excluded");
    expect(result.evidence).toContain("provider-smoke-result:no-apply");
  });
});
