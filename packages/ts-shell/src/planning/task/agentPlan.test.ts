import { describe, expect, it } from "vitest";

import { buildAgentPlan } from "./agentPlan.js";

describe("buildAgentPlan", () => {
  it("builds deterministic replay-safe no-write plan evidence", () => {
    const plan = buildAgentPlan({
      ownerCapability: "workspace-file-context",
      taskKind: "read-file",
      requestedActionKind: "context-planning",
      targetSummary: "src/target.ts",
      contextPacketIds: ["ctx_abc123"],
      contextCompleteness: "partial",
      confidence: "medium",
      executionReadiness: "needs-more-context",
      missingFacts: ["nearby tests not included"],
      suggestedReads: ["src/target.test.ts"],
      suggestedVerification: ["src/target.test.ts"],
      safeEvidenceMarkers: ["context-packet:raw-full-content-excluded"],
      mutationAuthority: "not-granted",
      redactionStatus: "redacted-and-budgeted",
      doNext: "Read src/target.test.ts before mutation.",
    });
    const again = buildAgentPlan({
      ...plan,
      safeEvidenceMarkers: ["context-packet:raw-full-content-excluded"],
    });

    expect(again.planId).toBe(plan.planId);
    expect(plan.replaySafeSummary).toContain("agent-plan plan_");
    expect(plan.replaySafeSummary).toContain("mutationAuthority=not-granted");
    expect(plan.replaySafeSummary).not.toContain("export const");
  });
});
