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
});
