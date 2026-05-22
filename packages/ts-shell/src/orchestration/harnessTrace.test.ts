import { describe, expect, it } from "vitest";
import { buildHarnessTrace } from "./harnessTrace.js";

describe("harnessTrace", () => {
  it("records lifecycle ids and safe failure taxonomy", () => {
    const trace = buildHarnessTrace({
      routeId: "route188",
      taskId: "task-1",
      contextPacketId: "ctx_packet_188",
      contextGraphId: "ctx_graph_188",
      agentPlanId: "plan_188",
      planQualityId: "plan_quality_188",
      verificationCommandPlanId: "verification-command-plan-188",
      runtimeReceiptMarkers: ["runtime-receipt-timeout:timed-out"],
      repairContextId: "repair_188",
      resultStatus: "stopped",
      status: "runtime timeout",
    });

    expect(trace.lifecycleStages).toEqual(["read", "plan", "verification", "repair", "result"]);
    expect(trace.failureTaxonomy.failureClass).toBe("runtime-timeout");
    expect(trace.evidence).toEqual(
      expect.arrayContaining([
        "harness-trace:context-packet:ctx_packet_188",
        "harness-trace:plan-quality:plan_quality_188",
        "harness-failure:runtime-timeout",
        "harness-trace:raw-content-excluded",
      ]),
    );
  });

  it("records provider dry-run prompt output anchor and no-write evidence", () => {
    const trace = buildHarnessTrace({
      routeId: "route193",
      providerDryRunId: "real_provider_proposal_dry_run_abc",
      providerDryRunGateDecision: "allow-dry-run",
      providerPromptAuditStatus: "pass",
      providerOutputValidationStatus: "valid-exact-single-target",
      providerAnchorQualityLevel: "exact-ready",
      providerDryRunCalled: true,
      status: "dry-run-exact-ready-no-write",
    });

    expect(trace.lifecycleStages).toContain("proposal");
    expect(trace.evidence).toEqual(
      expect.arrayContaining([
        "harness-trace:provider-dry-run:real_provider_proposal_dry_run_abc",
        "harness-trace:provider-prompt-audit:pass",
        "harness-trace:provider-output-validation:valid-exact-single-target",
        "harness-trace:provider-anchor-quality:exact-ready",
        "harness-trace:provider-called:true",
      ]),
    );
  });
});
