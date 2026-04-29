import { describe, expect, it } from "vitest";
import { executeFileMutationBranch } from "./mutationExecution.js";

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
});
