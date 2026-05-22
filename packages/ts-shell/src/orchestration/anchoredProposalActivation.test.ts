import { describe, expect, it } from "vitest";

import { activateAnchoredProposal } from "./anchoredProposalActivation.js";

describe("activateAnchoredProposal", () => {
  it("activates fake dry-run only after lifecycle analysis plan and redaction gates pass", () => {
    const activation = activateAnchoredProposal(readyInput());

    expect(activation.decision).toBe("activate-fake-dry-run");
    expect(activation.activated).toBe(true);
    expect(activation.providerCall).toBe("not-run");
    expect(activation.mutationAuthority).toBe("not-granted");
    expect(activation.evidence).toContain("anchored-proposal-activation:provider-call:not-run");
  });

  it("stops missing analysis low plan quality and missing dry-run mode no-write", () => {
    expect(activateAnchoredProposal({ ...readyInput(), analysisBriefId: undefined }).decision)
      .toBe("stop-missing-analysis");
    expect(activateAnchoredProposal({ ...readyInput(), planQualityLevel: "needs-more-context" }).decision)
      .toBe("stop-low-plan-quality");
    expect(activateAnchoredProposal({ ...readyInput(), dryRunMode: "none" }).decision)
      .toBe("stop-no-dry-run-mode");
  });

  it("requires explicit available provider for real opt-in dry-run", () => {
    const unavailable = activateAnchoredProposal({
      ...readyInput(),
      dryRunMode: "real-opt-in",
      providerAvailability: { kind: "not-configured", reason: "provider-readiness:missing-key" },
    });
    const available = activateAnchoredProposal({
      ...readyInput(),
      dryRunMode: "real-opt-in",
      providerAvailability: { kind: "available", providerKindLabel: "real-openai" },
    });

    expect(unavailable.decision).toBe("stop-provider-not-configured");
    expect(available.decision).toBe("activate-real-dry-run-if-opted-in");
    expect(available.providerSafeLabel).toBe("real-openai");
  });
});

function readyInput() {
  return {
    requestId: "route195",
    dryRunMode: "fake" as const,
    taskLifecycleId: "life_195",
    taskIntentId: "task_195",
    contextPacketId: "ctx_195",
    contextGraphId: "graph_195",
    codeGraphTraceId: "code_195",
    analysisBriefId: "analysis_195",
    analysisQualityId: "analysis_quality_195",
    analysisQualityDecision: "allow",
    taskExecutionPlanId: "exec_195",
    planQualityId: "plan_quality_195",
    planQualityLevel: "ready",
    redactionStatus: "redacted-and-budgeted",
  };
}
