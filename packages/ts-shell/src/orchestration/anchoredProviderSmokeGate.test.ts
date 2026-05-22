import { describe, expect, it } from "vitest";

import { evaluateAnchoredProviderSmokeGate } from "./anchoredProviderSmokeGate.js";

describe("anchoredProviderSmokeGate", () => {
  it("allows fake corpus without real provider readiness", () => {
    const gate = evaluateAnchoredProviderSmokeGate({
      requestId: "route196-fake",
      mode: "fake-corpus",
      lifecycleId: "life_196",
      analysisBriefId: "analysis_196",
      analysisQualityId: "analysis_quality_196",
      analysisQualityDecision: "allow",
      planQualityId: "plan_quality_196",
      planQualityLevel: "ready",
      dryRunMode: "no-write",
      redactionStatus: "redacted-and-budgeted",
    });

    expect(gate.decision).toBe("allow-fake-provider-corpus");
    expect(gate.allowed).toBe(true);
    expect(gate.providerCall).toBe("not-run");
    expect(gate.mutationAuthority).toBe("not-granted");
  });

  it("skips real-provider smoke without opt-in or provider readiness before provider call", () => {
    const noOptIn = evaluateAnchoredProviderSmokeGate({
      ...readyRealGate(),
      explicitSmokeOptIn: false,
    });
    const notConfigured = evaluateAnchoredProviderSmokeGate({
      ...readyRealGate(),
      explicitSmokeOptIn: true,
      providerAvailability: { kind: "not-configured", reason: "provider-readiness:missing-key" },
    });

    expect(noOptIn.decision).toBe("skip-no-opt-in");
    expect(noOptIn.skipReason).toBe("no-opt-in");
    expect(notConfigured.decision).toBe("skip-provider-not-configured");
    expect(notConfigured.skipReason).toBe("provider-not-configured");
    expect(noOptIn.providerCall).toBe("not-run");
    expect(notConfigured.providerCall).toBe("not-run");
  });

  it("stops missing lifecycle low quality prompt audit and redaction risks", () => {
    expect(evaluateAnchoredProviderSmokeGate({ ...readyRealGate(), lifecycleId: undefined }).decision)
      .toBe("stop-missing-lifecycle");
    expect(evaluateAnchoredProviderSmokeGate({ ...readyRealGate(), analysisQualityDecision: "stop" }).decision)
      .toBe("stop-low-analysis-quality");
    expect(evaluateAnchoredProviderSmokeGate({ ...readyRealGate(), planQualityLevel: "needs-more-context" }).decision)
      .toBe("stop-low-plan-quality");
    expect(evaluateAnchoredProviderSmokeGate({ ...readyRealGate(), promptAuditStatus: "fail" }).decision)
      .toBe("stop-prompt-audit-failed");
    expect(evaluateAnchoredProviderSmokeGate({ ...readyRealGate(), redactionStatus: "risk" }).decision)
      .toBe("stop-redaction-risk");
  });
});

function readyRealGate() {
  return {
    requestId: "route196-real",
    mode: "real-provider" as const,
    explicitSmokeOptIn: true,
    providerAvailability: { kind: "available" as const, providerKindLabel: "fake-real-provider" },
    lifecycleId: "life_196",
    analysisBriefId: "analysis_196",
    analysisQualityId: "analysis_quality_196",
    analysisQualityDecision: "allow",
    planQualityId: "plan_quality_196",
    planQualityLevel: "ready",
    promptAuditStatus: "pass",
    dryRunMode: "no-write",
    redactionStatus: "redacted-and-budgeted",
  };
}
