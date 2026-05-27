import { describe, expect, it } from "vitest";

import {
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
});
