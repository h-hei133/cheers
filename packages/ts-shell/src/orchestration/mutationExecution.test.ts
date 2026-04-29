import { describe, expect, it } from "vitest";
import {
  executeFileMutationBranch,
  summarizeFileMutationResults,
} from "./mutationExecution.js";

describe("mutationExecution", () => {
  it("reports changed file and applied patch when dispatch succeeds", async () => {
    const result = await executeFileMutationBranch({
      path: "src/app.ts",
      content: "export const value = 2;\n",
      operation: "replace",
      changedLines: 1,
      addedLines: 0,
      removedLines: 0,
      failureReason: "write failed",
      appliedNote: "applied",
      appliedEvidence: "transform:src/app.ts:1=>2",
      dispatch: async () => ({ success: true }),
    });

    expect(result.changedFile).toBe("src/app.ts");
    expect(result.failedFile).toBeUndefined();
    expect(result.patch).toEqual({
      path: "src/app.ts",
      operation: "replace",
      status: "applied",
      changedLines: 1,
      addedLines: 0,
      removedLines: 0,
    });
    expect(result.appliedContent).toEqual({
      path: "src/app.ts",
      normalizedPath: "src/app.ts",
      content: "export const value = 2;\n",
    });
    expect(result.note).toBe("applied");
    expect(result.evidence).toBe("transform:src/app.ts:1=>2");
  });

  it("reports failed file and write-failed patch when dispatch fails", async () => {
    const result = await executeFileMutationBranch({
      path: "src/app.ts",
      content: "export const value = 2;\n",
      operation: "replace",
      changedLines: 1,
      addedLines: 0,
      removedLines: 0,
      failureReason: "fallback write failure",
      dispatch: async () => ({ success: false, error: "disk denied" }),
    });

    expect(result.changedFile).toBeUndefined();
    expect(result.appliedContent).toBeUndefined();
    expect(result.failedFile).toEqual({
      path: "src/app.ts",
      reason: "disk denied",
    });
    expect(result.patch).toEqual({
      path: "src/app.ts",
      operation: "replace",
      status: "failed",
      failureCode: "write-failed",
      reason: "disk denied",
    });
  });

  it("summarizes partial mutation failure as failed instead of success", async () => {
    const changed = await executeFileMutationBranch({
      path: "src/app.ts",
      content: "export const value = 2;\n",
      operation: "replace",
      changedLines: 1,
      addedLines: 0,
      removedLines: 0,
      failureReason: "fallback write failure",
      appliedEvidence: "transform:src/app.ts:1=>2",
      dispatch: async () => ({ success: true }),
    });
    const failed = await executeFileMutationBranch({
      path: "src/config.ts",
      content: "export const enabled = true;\n",
      operation: "replace",
      changedLines: 1,
      addedLines: 0,
      removedLines: 0,
      failureReason: "fallback write failure",
      dispatch: async () => ({ success: false, error: "disk denied" }),
    });

    const summary = summarizeFileMutationResults([changed, failed]);

    expect(summary.ok).toBe(false);
    expect(summary.status).toBe("failed");
    expect(summary.changedFiles).toEqual(["src/app.ts"]);
    expect(summary.failedFiles).toEqual([
      { path: "src/config.ts", reason: "disk denied" },
    ]);
    expect(summary.patches.map((patch) => patch.status)).toEqual([
      "applied",
      "failed",
    ]);
    if (!summary.ok) {
      expect(summary.blocker.code).toBe("partial-mutation-failed");
      expect(summary.blocker.nextAction).toContain("retry only");
    }
  });

  it("treats failed patch records as blocker evidence even without failedFile", () => {
    const summary = summarizeFileMutationResults([
      {
        changedFile: "src/app.ts",
        patch: {
          path: "src/app.ts",
          operation: "replace",
          status: "applied",
          changedLines: 1,
          addedLines: 0,
          removedLines: 0,
        },
      },
      {
        patch: {
          path: "src/config.ts",
          operation: "replace",
          status: "failed",
          failureCode: "patch-from-not-found",
          reason: "Patch source text was not found in the target file.",
        },
      },
    ]);

    expect(summary.ok).toBe(false);
    if (!summary.ok) {
      expect(summary.blocker.code).toBe("partial-mutation-failed");
      expect(summary.changedFiles).toEqual(["src/app.ts"]);
      expect(summary.failedFiles).toEqual([
        {
          path: "src/config.ts",
          reason: "Patch source text was not found in the target file.",
        },
      ]);
      expect(summary.patches.map((patch) => patch.failureCode)).toEqual([
        undefined,
        "patch-from-not-found",
      ]);
    }
  });
});
