import { describe, expect, it } from "vitest";
import { createRuntimeReceipt } from "../core/runtime/runtimeReceipt.js";
import {
  buildCompletedToolResult,
  buildPolicyBlockedResult,
} from "../core/tools/toolPolicyResult.js";
import { aggregateTurnReceipts } from "./turnReceiptAggregation.js";
import { projectTurnCapabilityPlan } from "./turnCapabilityPlan.js";
import {
  projectTurnKernel,
  projectTurnResultHandoff,
} from "./turnKernel.js";

describe("turnKernel", () => {
  it("projects no-write read/inspect turn summaries", () => {
    const plan = projectTurnCapabilityPlan({
      taskKind: "read-file",
      targetPath: "src/app.ts",
      verification: { status: "not-requested", reason: "read-only task" },
    });

    expect(plan).toMatchObject({
      turnKind: "read-file",
      capabilityArea: "read-inspect",
      selectedModuleOwner: "workspace-file-context",
      mutationClassification: "no-write",
      targetSummary: "src/app.ts",
    });
  });

  it("aggregates command success receipts without changing completed classification", () => {
    const receipt = buildCompletedToolResult({
      capability: "command",
      reasonCode: "tool-succeeded",
      reason: "Command executed successfully: npm test",
      doNext: "Continue with the command result.",
      evidence: ["command:passed"],
    });
    const turn = projectTurnKernel({
      capabilityPlan: {
        taskKind: "run-command",
        directCommand: "npm test",
        verification: { status: "passed", command: "npm test" },
      },
      receipts: {
        toolReceipts: [receipt],
        evidence: ["verify:passed"],
      },
    });

    expect(turn.receiptAggregation).toMatchObject({
      resultState: "completed",
      redaction: "clean",
    });
    expect(turn.receiptAggregation.evidenceIds).toEqual(
      expect.arrayContaining(["command:passed", "verify:passed"]),
    );
  });

  it("keeps command blocked receipts stopped with do-next preserved", () => {
    const receipt = buildPolicyBlockedResult({
      capability: "command",
      reasonCode: "policy-blocked",
      reason: "Command blocked by policy.",
      doNext: "Ask for approval before retrying.",
      evidence: ["command:blocked"],
    });
    const aggregation = aggregateTurnReceipts({
      plan: projectTurnCapabilityPlan({
        taskKind: "run-command",
        directCommand: "rm -rf dist",
      }),
      toolReceipts: [receipt],
    });

    expect(aggregation).toMatchObject({
      resultState: "stopped",
      doNextSummary: "Ask for approval before retrying.",
    });
  });

  it("projects edit missing-content stopped summaries without granting mutation", () => {
    const turn = projectTurnKernel({
      capabilityPlan: {
        taskKind: "write-file",
        targetPath: "src/new.ts",
        blockedReason: "Provide concrete content explicitly.",
        verification: { status: "skipped", reason: "write stopped" },
      },
      receipts: {
        doNext: "Provide fenced code or literal content.",
      },
    });

    expect(turn.capabilityPlan).toMatchObject({
      capabilityArea: "edit-write",
      selectedModuleOwner: "edit-patch",
      mutationClassification: "mutation-blocked",
    });
    expect(turn.receiptAggregation).toMatchObject({
      resultState: "stopped",
      doNextSummary: "Provide fenced code or literal content.",
    });
  });

  it("summarizes verification skipped and not-requested states", () => {
    expect(
      aggregateTurnReceipts({
        plan: projectTurnCapabilityPlan({
          taskKind: "edit-file",
          targetPath: "src/app.ts",
          verification: { status: "skipped", reason: "no verify command" },
        }),
        verification: { status: "skipped", reason: "no verify command" },
      }),
    ).toMatchObject({
      resultState: "completed",
      evidenceIds: ["turn-verification:skipped"],
    });

    expect(
      projectTurnCapabilityPlan({
        taskKind: "read-file",
        verification: { status: "not-requested" },
      }).verificationExpectation,
    ).toBe("not-requested");
  });

  it("keeps continuation lineage replay-safe in aggregation", () => {
    const aggregation = aggregateTurnReceipts({
      plan: projectTurnCapabilityPlan({
        taskKind: "edit-file",
        targetPath: "src/app.ts",
        continuationLineage: ["lineage:activated"],
      }),
      continuationEvidence: ["lineage:activated"],
    });

    expect(aggregation.transcriptSafeTurnSummary).toContain("edit-file");
    expect(aggregation.evidenceIds).toContain("lineage:activated");
  });

  it("redacts browser-like raw content and secrets from turn summaries", () => {
    const runtime = createRuntimeReceipt({
      runtimeKind: "browser",
      execution: "failed",
      result: "stopped",
      reasonCode: "browser-blocked",
      reason: "raw DOM <html><body>token=secret</body></html>",
      doNext: "Do not expose token=secret",
      evidence: ["raw-dom:<html>", "/home/wang/.private-agents-real/config"],
    });
    const aggregation = aggregateTurnReceipts({
      plan: projectTurnCapabilityPlan({ taskKind: "browser" }),
      runtimeReceipts: [runtime],
      observations: ["<html>api_key=abc</html>"],
    });

    expect(aggregation.redaction).toBe("redacted");
    expect(aggregation.transcriptSafeTurnSummary).not.toContain("<html>");
    expect(aggregation.transcriptSafeTurnSummary).not.toContain("abc");
    expect(aggregation.evidenceIds.join("\n")).not.toContain(
      "/home/wang/.private-agents-real",
    );
  });

  it("keeps completed, stopped, and failed result handoff classifications stable", () => {
    const completed = projectTurnResultHandoff({
      capabilityPlan: {
        taskKind: "run-command",
        directCommand: "npm --version",
        verification: { status: "passed", command: "npm --version" },
      },
      command: {
        command: "npm --version",
        changedFiles: [],
        failedFiles: [],
        patches: [],
        verifiedFiles: [],
        unverifiedFiles: [],
        verification: { status: "passed", command: "npm --version" },
        repairNotes: [],
        evidence: ["verify:passed"],
      },
    });
    expect(completed.turn.receiptAggregation.resultState).toBe("completed");
    expect(completed.codingResult.taskSatisfaction.verdict).toBe("satisfied");

    const stopped = projectTurnResultHandoff({
      capabilityPlan: {
        taskKind: "edit-file",
        targetPath: "src/app.ts",
        verification: { status: "blocked", reason: "approval denied" },
      },
      receipts: {
        verification: {
          status: "blocked",
          reason: "approval denied",
        },
      },
      mutation: mutationInput({
        failedFiles: [{ path: "src/app.ts", reason: "approval denied" }],
        verification: {
          status: "blocked",
          reason: "approval denied",
          blockerKind: "approval-denied",
        },
      }),
    });
    expect(stopped.turn.receiptAggregation.resultState).toBe("stopped");
    expect(stopped.codingResult.failedFiles).toHaveLength(1);

    const failed = projectTurnResultHandoff({
      capabilityPlan: {
        taskKind: "edit-file",
        targetPath: "src/app.ts",
        verification: { status: "failed", reason: "test failed" },
      },
      receipts: {
        verification: { status: "failed", reason: "test failed" },
      },
      mutation: mutationInput({
        verification: { status: "failed", reason: "test failed" },
        unverifiedFiles: [{ path: "src/app.ts", reason: "test failed" }],
      }),
    });
    expect(failed.turn.receiptAggregation.resultState).toBe("failed");
    expect(failed.codingResult.verification.status).toBe("failed");
  });
});

function mutationInput(
  overrides: Partial<Parameters<typeof projectTurnResultHandoff>[0]["mutation"]> = {},
): NonNullable<Parameters<typeof projectTurnResultHandoff>[0]["mutation"]> {
  return {
    taskKind: "edit-file",
    changedFiles: [],
    failedFiles: [],
    patches: [],
    verifiedFiles: [],
    unverifiedFiles: [],
    verification: { status: "not-requested" },
    repairNotes: [],
    evidence: [],
    degradedCrossFileTargets: [],
    crossFileRemainingTargets: [],
    crossFileFailedByReason: [],
    crossFileSkippedFiles: [],
    ...overrides,
  };
}
