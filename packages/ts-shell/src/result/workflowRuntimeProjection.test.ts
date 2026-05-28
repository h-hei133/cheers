import { describe, expect, it } from "vitest";

import {
  projectWorkflowExecutionResultContract,
  projectWorkflowRuntimeResultContract,
  truncateText,
} from "./workflowRuntimeProjection.js";

describe("workflowRuntimeProjection", () => {
  it("keeps run-command handoff truthfulness unchanged for blocked verification", () => {
    const projection = projectWorkflowRuntimeResultContract({
      workspaceRoot: "/tmp/workspace",
      preRunGitChangeSet: {
        insideGit: false,
        root: undefined,
        entries: [],
        summary: "not a git repository",
      },
      attributeChangeSet: false,
      handoff: {
        capabilityPlan: {
          taskKind: "run-command",
          directCommand: "curl https://example.com",
          verification: {
            status: "skipped",
            reason: "Command is not allowlisted.",
            command: "curl https://example.com",
            selectionScope: "none",
            selectionSource: "not-requested",
          },
        },
        receipts: {
          evidence: ["command blocked"],
          verification: {
            status: "skipped",
            reason: "Command is not allowlisted.",
            command: "curl https://example.com",
            selectionScope: "none",
            selectionSource: "not-requested",
          },
        },
        command: {
          command: "curl https://example.com",
          changedFiles: [],
          failedFiles: [{ path: "(command)", reason: "Command is not allowlisted." }],
          patches: [],
          verifiedFiles: [],
          unverifiedFiles: [],
          verification: {
            status: "skipped",
            reason: "Command is not allowlisted.",
            command: "curl https://example.com",
            selectionScope: "none",
            selectionSource: "not-requested",
          },
          repairNotes: [],
          evidence: ["command blocked"],
        },
      },
    });

    expect(projection.codingResult.status).not.toBe("success");
    expect(projection.userFacingOutput).toMatch(/not completed|blocked|skipped/i);
  });

  it("truncates long evidence text deterministically", () => {
    expect(truncateText("x".repeat(230))).toHaveLength(223);
  });

  it("does not treat execution receipt success or exit code zero as verified task success", () => {
    const projection = projectWorkflowExecutionResultContract({
      plan: {
        taskKind: "run-command",
        directCommand: "printf ok",
        verifyAfterEdit: false,
        inspectFirst: false,
      } as never,
      workspaceRoot: "/tmp/workspace",
      preRunGitChangeSet: {
        insideGit: false,
        root: undefined,
        entries: [],
        summary: "not a git repository",
      },
      dispatchedRunCommand: "printf ok",
      changedFiles: [],
      failedFiles: [],
      patches: [],
      verifiedFiles: [],
      unverifiedFiles: [],
      verification: {
        status: "not-requested",
        command: "printf ok",
        selectionScope: "none",
        selectionSource: "not-requested",
      },
      repairNotes: [],
      evidence: [
        "execution-receipt:success:completed",
        "exit-code:0",
        "verification:not-run",
      ],
      degradedCrossFileTargets: [],
      crossFileRemainingTargets: [],
      crossFileFailedByReason: [],
      crossFileSkippedFiles: [],
    });

    expect(projection.codingResult.status).not.toBe("success");
    expect(projection.codingResult.taskSatisfaction.verdict).not.toBe("satisfied");
  });

  it("adds failure repair fallback without turning failed mutation into success", () => {
    const projection = projectWorkflowExecutionResultContract({
      plan: {
        taskKind: "edit-file",
        targetPath: "src/a.ts",
        verifyAfterEdit: false,
        inspectFirst: false,
      } as never,
      workspaceRoot: "/tmp/workspace",
      preRunGitChangeSet: {
        insideGit: false,
        root: undefined,
        entries: [],
        summary: "not a git repository",
      },
      changedFiles: [],
      failedFiles: [{ path: "src/a.ts", reason: "patch failed" }],
      patches: [],
      verifiedFiles: [],
      unverifiedFiles: [],
      verification: {
        status: "not-requested",
        selectionScope: "none",
        selectionSource: "not-requested",
      },
      repairNotes: [],
      evidence: ["patch failed"],
      degradedCrossFileTargets: [],
      crossFileRemainingTargets: [],
      crossFileFailedByReason: [],
      crossFileSkippedFiles: [],
    });

    expect(projection.codingResult.status).not.toBe("success");
    expect(projection.codingResult.repair.notes).toContain(
      "operation failed; inspect failed items and rerun with clearer target/instruction",
    );
  });
});
