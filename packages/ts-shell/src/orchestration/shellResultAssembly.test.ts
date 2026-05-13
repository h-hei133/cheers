import { describe, expect, it } from "vitest";
import {
  assembleShellResult,
  buildShellCodingResult,
  deriveActionableBlockerContract,
  renderShellExecutionSummary,
  type ShellResultAssemblyInput,
} from "./shellResultAssembly.js";

describe("shell result assembly", () => {
  it("assembles successful mutation output while preserving changed files", () => {
    const result = assembleShellResult(
      assemblyInput({
        changedFiles: ["src/a.ts"],
        verifiedFiles: ["src/a.ts"],
        verification: {
          status: "passed",
          reason: "verify completed",
          selectionScope: "focused",
          selectionSource: "auto-from-changes",
        },
        evidence: ["attempted-file:src/a.ts"],
      }),
    );

    expect(result.codingResult.changedFiles).toEqual(["src/a.ts"]);
    expect(result.codingResult.failedFiles).toEqual([]);
    expect(result.codingResult.verification.status).toBe("passed");
    expect(result.codingResult.taskSatisfaction.verdict).toBe("satisfied");
    expect(result.userFacingOutput).toContain("Edit completed for src/a.ts.");
  });

  it("adds actionable blocker evidence and next action for verification failure", () => {
    const result = buildShellCodingResult("edit-file", {
      changedFiles: ["src/a.ts"],
      failedFiles: [],
      patches: [],
      verifiedFiles: [],
      unverifiedFiles: [
        {
          path: "src/a.ts",
          reason: "verification failed",
        },
      ],
      verification: {
        status: "failed",
        reason: "verification failed",
      },
      repairNotes: ["verify failed after edit"],
      evidence: ["attempted-file:src/a.ts"],
      taskVerdict: "completed-with-caveats",
      taskReasons: ["verification failed"],
    });

    expect(result.changedFiles).toEqual(["src/a.ts"]);
    expect(result.failedFiles).toEqual([]);
    expect(result.verification.nextAction).toBe(
      "Fix the verification failure, then rerun the verification step.",
    );
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "actionable-blocker-kind:verification-failed",
        "actionable-blocker-next:Fix the verification failure, then rerun the verification step.",
      ]),
    );
  });

  it("projects partial cross-file stops without dropping changed or failed files", () => {
    const result = assembleShellResult(
      assemblyInput({
        changedFiles: ["src/a.ts"],
        failedFiles: [
          {
            path: "src/b.ts",
            reason: "post-write verification failed",
          },
        ],
        verifiedFiles: ["src/a.ts"],
        unverifiedFiles: [
          {
            path: "src/b.ts",
            reason: "post-write verification failed",
          },
        ],
        verification: {
          status: "blocked",
          reason: "inspect both files before retrying",
          blockerKind: "environment-not-ready",
          nextAction: "Inspect both files, then retry only the failed file.",
        },
        crossFileRemainingTargets: ["src/b.ts"],
        crossFileFailedByReason: [
          {
            path: "src/b.ts",
            failureCode: "write-failed",
            reason: "post-write verification failed",
          },
        ],
      }),
    );

    expect(result.codingResult.changedFiles).toEqual(["src/a.ts"]);
    expect(result.codingResult.failedFiles).toEqual([
      {
        path: "src/b.ts",
        reason: "post-write verification failed",
      },
    ]);
    expect(result.userFacingOutput).toBe(
      "Edit partially completed for src/a.ts. Remaining cross-file targets: src/b.ts. Failed this turn: src/b.ts (write-failed).",
    );
  });

  it("renders stopped degraded cross-file result before generic mutation delivery", () => {
    const result = assembleShellResult(
      assemblyInput({
        changedFiles: [],
        failedFiles: [
          {
            path: "src/a.ts",
            reason: "unrecoverable remaining targets",
          },
        ],
        verification: {
          status: "blocked",
          reason: "unrecoverable remaining targets",
        },
        crossFileDegradationReason: "target recovery is ambiguous",
        degradedCrossFileTargets: ["src/a.ts", "src/b.ts"],
      }),
    );

    expect(result.codingResult.changedFiles).toEqual([]);
    expect(result.codingResult.failedFiles.map((entry) => entry.path)).toEqual([
      "src/a.ts",
    ]);
    expect(result.userFacingOutput).toBe(
      "Task stopped: unrecoverable remaining targets detected (src/a.ts, src/b.ts). target recovery is ambiguous",
    );
  });

  it("keeps execution summary fields stable", () => {
    const execution = assembleShellResult(
      assemblyInput({
        changedFiles: ["src/a.ts"],
        verifiedFiles: ["src/a.ts"],
        verification: {
          status: "passed",
          command: "npm test -- --help",
          reason: "verify completed",
        },
      }),
    );

    expect(
      renderShellExecutionSummary({
        taskKind: "edit-file",
        execution,
      }),
    ).toBe(
      [
        "Coding workflow execution summary",
        "task=edit-file",
        "workflow-status=ready",
        "changed=src/a.ts",
        "failed=none",
        "verify=passed command=npm test -- --help",
        "repair=not-needed",
        "next=Workflow completed under inspect/edit/verify contract.",
      ].join("\n"),
    );
  });

  it("classifies DoNext for explicit actionable blockers", () => {
    expect(
      deriveActionableBlockerContract({
        reason: "patch-from-not-found: source text missing",
      }),
    ).toEqual({
      blockerKind: "patch-from-not-found",
      reason: "patch-from-not-found: source text missing",
      doNext:
        "Provide the exact current source text from the target file, then rerun the patch.",
    });
  });
});

function assemblyInput(
  overrides: Partial<ShellResultAssemblyInput>,
): ShellResultAssemblyInput {
  return {
    taskKind: "edit-file",
    changedFiles: [],
    failedFiles: [],
    patches: [],
    verifiedFiles: [],
    unverifiedFiles: [],
    verification: {
      status: "not-requested",
      reason: "not requested",
    },
    repairNotes: [],
    evidence: [],
    degradedCrossFileTargets: [],
    crossFileRemainingTargets: [],
    crossFileFailedByReason: [],
    crossFileSkippedFiles: [],
    ...overrides,
  };
}
