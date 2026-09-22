import { describe, expect, it } from "vitest";
import type { CodingResultSummary } from "../../result/types.js";
import { projectSessionApprovalContinuity } from "./sessionApprovalContinuity.js";

describe("projectSessionApprovalContinuity", () => {
  it("projects approval memory and provenance as facts only", () => {
    const continuity = projectSessionApprovalContinuity({
      workingMemory: {
        approvalAudit: {
          decision: "allow-once",
          decisionSource: "cli",
          persistent: false,
          cacheEffect: "none",
          projectRoot: "/repo",
          cacheKey: "/repo|bash:spawn",
          scopeLabel: "bash/spawn",
          recordedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      lastCodingResult: makeCodingResult(),
      historyLimit: 16,
    });

    expect(continuity).toMatchObject({
      lastApprovalDecision: "allow-once",
      lastApprovalDecisionSource: "cli",
      lastApprovalProvenanceKind: "approved",
      lastApprovalProvenanceToolName: "bash",
    });
    expect(continuity).not.toHaveProperty("writeAllowed");
    expect(continuity).not.toHaveProperty("commandAllowed");
  });
});

function makeCodingResult(): CodingResultSummary {
  return {
    taskKind: "edit-file",
    changedFiles: [],
    failedFiles: [],
    patches: [],
    repair: {
      status: "not-needed",
      attempts: 0,
      recoveredItems: [],
      failedItems: [],
      notes: [],
    },
    continuation: {
      status: "first-pass-success",
      attempts: 0,
      evidence: [],
    },
    verification: { status: "not-run" },
    taskSatisfaction: { verdict: "satisfied", reasons: [] },
    evidence: [],
    verifiedFiles: [],
    unverifiedFiles: [],
    provenance: {
      approvalDecisions: [
        {
          kind: "approved",
          source: "session-memory",
          toolName: "bash",
          taskId: "task-1",
        },
      ],
      toolExecutions: [],
    },
  };
}
