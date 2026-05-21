import { describe, expect, it } from "vitest";

import { projectContextPacketToAgentPlanContext } from "./agentPlanContext.js";
import { projectWorkflowTaskPlanToAgentPlan } from "./agentPlanProjection.js";
import type { TargetedContextPacket } from "./contextPacket.js";
import type { WorkflowTaskPlan } from "./workflowTaskPlanner.js";

describe("projectWorkflowTaskPlanToAgentPlan", () => {
  it("classifies broad edit with context packet as needs-more-context", () => {
    const workflowPlan: WorkflowTaskPlan = {
      taskKind: "edit-file",
      reason: "edit intent needs targeted context planning before mutation",
      targetPath: "src/target.ts",
      blockedReason: "Missing concrete edit transform.",
      contextPlanningRequested: true,
      contextPlanningReason: "missing-edit-context",
      inspectFirst: false,
      verifyAfterEdit: false,
    };

    const plan = projectWorkflowTaskPlanToAgentPlan({
      workflowPlan,
      context: projectContextPacketToAgentPlanContext(makePacket()),
    });

    expect(plan.requestedActionKind).toBe("context-planning");
    expect(plan.executionReadiness).toBe("needs-more-context");
    expect(plan.missingFacts).toContain("concrete edit transform not provided");
    expect(plan.suggestedReads).toEqual(
      expect.arrayContaining(["src/target.ts", "src/target.test.ts"]),
    );
    expect(plan.mutationAuthority).toBe("not-granted");
  });

  it("classifies exact edit mapping as ready without granting mutation authority", () => {
    const workflowPlan: WorkflowTaskPlan = {
      taskKind: "edit-file",
      reason: "edit intent with explicit target",
      targetPath: "src/target.ts",
      replaceFrom: "old",
      replaceTo: "new",
      inspectFirst: true,
      verifyAfterEdit: true,
      verifyCommand: "npm test",
    };

    const plan = projectWorkflowTaskPlanToAgentPlan({ workflowPlan });

    expect(plan.executionReadiness).toBe("ready");
    expect(plan.confidence).toBe("high");
    expect(plan.suggestedVerification).toEqual(["npm test"]);
    expect(plan.mutationAuthority).toBe("not-granted");
  });
});

function makePacket(): TargetedContextPacket {
  return {
    packetId: "ctx_test",
    rootTargetFile: "src/target.ts",
    targetSafeLabel: "src/target.ts",
    targetKind: "explicit-code-target",
    readBudget: {
      maxCandidateCount: 4,
      maxFilesRead: 4,
      maxBytesPerFile: 100,
      maxTotalBytes: 400,
      filesRead: 2,
      bytesUsed: 80,
    },
    contextSources: [],
    selectedCandidateSummaries: [
      {
        kind: "target-file-summary",
        pathLabel: "src/target.ts",
        relation: "explicit target",
        status: "included",
        summary: "lines=1",
        byteLength: 40,
        redactionApplied: false,
      },
    ],
    omittedCandidateSummaries: [
      {
        kind: "omitted-over-budget-candidate",
        pathLabel: "src/target.test.ts",
        relation: "nearby test",
        status: "omitted",
        reason: "file budget",
        byteLength: 500,
        redactionApplied: false,
      },
    ],
    confidence: "medium",
    completenessStatus: "partial",
    freshnessFacts: ["fresh"],
    redactionStatus: "redacted-and-budgeted",
    replaySafeSummary: "context-packet ctx_test; target=src/target.ts",
    mutationAuthority: "not-granted",
    evidence: ["context-packet:raw-full-content-excluded"],
  };
}
