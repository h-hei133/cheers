import { describe, expect, it } from "vitest";

import { buildAgentPlan } from "./agentPlan.js";
import {
  buildAgentPlanResult,
  projectAgentPlanRuntimeOutcome,
} from "./agentPlanResult.js";

describe("agent plan result projection", () => {
  it("renders needs-more-context without execution success", () => {
    const plan = buildAgentPlan({
      ownerCapability: "workspace-file-context",
      taskKind: "edit-file",
      requestedActionKind: "context-planning",
      targetSummary: "src/target.ts",
      contextPacketIds: ["ctx_test"],
      codeGraphTraceIds: ["code_graph_trace_test"],
      impactQueryId: "code_graph_impact_test",
      impactReadiness: "impact-ready",
      likelyAffectedFiles: ["src/consumer.ts"],
      likelyAffectedTests: ["src/target.test.ts"],
      contextCompleteness: "missing-context",
      confidence: "low",
      executionReadiness: "needs-more-context",
      missingFacts: ["concrete edit transform not provided"],
      suggestedReads: ["src/target.test.ts"],
      suggestedVerification: [],
      safeEvidenceMarkers: ["agent-plan:mutation-authority:not-granted"],
      mutationAuthority: "not-granted",
      redactionStatus: "redacted-and-budgeted",
      doNext: "Read src/target.test.ts before mutation.",
    });

    const result = buildAgentPlanResult(plan);
    const runtime = projectAgentPlanRuntimeOutcome({ plan });

    expect(result.outcome).toBe("needs-more-context");
    expect(result.output).toContain("Agent plan: needs-more-context");
    expect(result.output).toContain("Code graph traces: code_graph_trace_test");
    expect(result.output).toContain("Impact query: code_graph_impact_test");
    expect(result.output).toContain("Likely affected tests: src/target.test.ts");
    expect(result.output).toContain("Mutation authority: not-granted");
    expect(runtime.codingResult.taskSatisfaction.verdict).toBe(
      "insufficient-evidence",
    );
    expect(runtime.codingResult.changedFiles).toEqual([]);
  });

  it("renders ready plans as planning readiness, not mutation authority", () => {
    const plan = buildAgentPlan({
      ownerCapability: "edit-patch",
      taskKind: "edit-file",
      requestedActionKind: "edit",
      targetSummary: "src/target.ts",
      contextPacketIds: [],
      contextCompleteness: "not-requested",
      confidence: "high",
      executionReadiness: "ready",
      missingFacts: [],
      suggestedReads: [],
      suggestedVerification: ["npm test"],
      safeEvidenceMarkers: ["agent-plan:readiness:ready"],
      mutationAuthority: "not-granted",
      redactionStatus: "not-applicable",
      doNext: "Proceed through the existing edit-file route.",
    });

    const result = buildAgentPlanResult(plan);

    expect(result.outcome).toBe("verification-needed");
    expect(result.output).toContain("Readiness: ready");
    expect(result.output).toContain("Mutation authority: not-granted");
  });
});
