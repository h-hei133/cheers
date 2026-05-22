import { describe, expect, it } from "vitest";
import { evaluateRealProviderProposalGate } from "./realProviderProposalGate.js";

describe("realProviderProposalGate", () => {
  it("stops before provider call when dry-run is not explicitly opted in", () => {
    const gate = evaluateRealProviderProposalGate({
      requestId: "req-193",
      dryRunOptIn: false,
      lifecycleId: "life_193",
      analysisBriefId: "analysis_193",
      analysisQualityId: "analysis_quality_193",
      analysisQualityDecision: "allow",
      planQualityId: "plan_quality_193",
      planQualityLevel: "ready",
      contextPacketId: "ctx_193",
      contextGraphId: "graph_193",
      codeGraphTraceId: "code_trace_193",
      taskExecutionPlanId: "exec_193",
      providerAvailability: { kind: "available", providerKindLabel: "real-openai" },
      redactionStatus: "redacted-and-budgeted",
    });

    expect(gate.allowed).toBe(false);
    expect(gate.decision).toBe("stop-no-opt-in");
    expect(gate.mutationAuthority).toBe("not-granted");
    expect(gate.evidence).toContain("real-provider-proposal-gate:mutation-authority:not-granted");
  });

  it("allows dry-run only with lifecycle analysis plan quality context and redaction evidence", () => {
    const gate = evaluateRealProviderProposalGate({
      requestId: "req-193",
      dryRunOptIn: true,
      lifecycleId: "life_193",
      analysisBriefId: "analysis_193",
      analysisQualityId: "analysis_quality_193",
      analysisQualityDecision: "allow",
      planQualityId: "plan_quality_193",
      planQualityLevel: "ready",
      contextPacketId: "ctx_193",
      contextGraphId: "graph_193",
      codeGraphTraceId: "code_trace_193",
      taskExecutionPlanId: "exec_193",
      providerAvailability: { kind: "available", providerKindLabel: "real-openai" },
      redactionStatus: "redacted-and-budgeted",
    });

    expect(gate.allowed).toBe(true);
    expect(gate.decision).toBe("allow-dry-run");
  });

  it("classifies provider unavailable and quality preconditions before allow", () => {
    expect(
      evaluateRealProviderProposalGate({
        requestId: "req-provider",
        dryRunOptIn: true,
        providerAvailability: { kind: "not-configured", reason: "provider-readiness:missing-key" },
      }).decision,
    ).toBe("stop-provider-not-configured");

    expect(
      evaluateRealProviderProposalGate({
        requestId: "req-analysis",
        dryRunOptIn: true,
        lifecycleId: "life_193",
        analysisBriefId: "analysis_193",
        analysisQualityId: "analysis_quality_193",
        analysisQualityDecision: "stop",
        providerAvailability: { kind: "available", providerKindLabel: "real-openai" },
      }).decision,
    ).toBe("stop-low-analysis-quality");
  });
});
