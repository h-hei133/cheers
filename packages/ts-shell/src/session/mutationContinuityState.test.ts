import { describe, expect, it } from "vitest";
import type { CodingResultSummary } from "../result/types.js";
import { buildMutationContinuityState } from "./mutationContinuityState.js";

describe("buildMutationContinuityState", () => {
  it("keeps planned targets distinct from changed files for no-write stops", () => {
    const state = buildMutationContinuityState({
      lastUserIntent: "continue in src/c.ts",
      recentCodingResults: [
        makeCodingResult({
          attemptedFiles: ["src/a.ts", "src/b.ts"],
          changedFiles: [],
          verifiedFiles: [],
          failedFiles: [
            { path: "src/a.ts", reason: "3-file writes are unsupported" },
            { path: "src/b.ts", reason: "3-file writes are unsupported" },
          ],
        }),
      ],
      lastCodingResult: makeCodingResult({
        attemptedFiles: ["src/a.ts", "src/b.ts"],
        changedFiles: [],
        verifiedFiles: [],
        failedFiles: [
          { path: "src/a.ts", reason: "3-file writes are unsupported" },
          { path: "src/b.ts", reason: "3-file writes are unsupported" },
        ],
      }),
    });

    expect(state.recentChangedFiles).toEqual([]);
    expect(state.recentTargetFiles).toEqual([
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
    ]);
    expect(state.recentFailedFiles).toEqual([
      { path: "src/a.ts", reason: "3-file writes are unsupported" },
      { path: "src/b.ts", reason: "3-file writes are unsupported" },
    ]);
    expect(state.recentVerifiedFiles).toEqual([]);
  });

  it("reports changed and verified files from the latest coding result", () => {
    const state = buildMutationContinuityState({
      recentCodingResults: [
        makeCodingResult({
          attemptedFiles: ["src/old.ts"],
          changedFiles: ["src/old.ts"],
          verifiedFiles: ["src/old.ts"],
          failedFiles: [],
        }),
        makeCodingResult({
          attemptedFiles: ["src/a.ts", "src/b.ts"],
          changedFiles: ["src/a.ts"],
          verifiedFiles: ["src/a.ts"],
          failedFiles: [{ path: "src/b.ts", reason: "write failed" }],
        }),
      ],
      lastCodingResult: makeCodingResult({
        attemptedFiles: ["src/a.ts", "src/b.ts"],
        changedFiles: ["src/a.ts"],
        verifiedFiles: ["src/a.ts"],
        failedFiles: [{ path: "src/b.ts", reason: "write failed" }],
      }),
    });

    expect(state.recentChangedFiles).toEqual(["src/a.ts"]);
    expect(state.recentVerifiedFiles).toEqual(["src/a.ts"]);
    expect(state.recentFailedFiles).toEqual([
      { path: "src/b.ts", reason: "write failed" },
    ]);
    expect(state.recentTargetFiles).toEqual([
      "src/old.ts",
      "src/a.ts",
      "src/b.ts",
    ]);
  });
});

function makeCodingResult(input: {
  readonly attemptedFiles: readonly string[];
  readonly changedFiles: readonly string[];
  readonly verifiedFiles: readonly string[];
  readonly failedFiles: ReadonlyArray<{ path: string; reason: string }>;
}): CodingResultSummary {
  return {
    taskKind: "edit-file",
    changedFiles: input.changedFiles,
    failedFiles: input.failedFiles,
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
    verification: { status: "blocked" },
    taskSatisfaction: { verdict: "insufficient-evidence", reasons: [] },
    evidence: [],
    verifiedFiles: input.verifiedFiles,
    unverifiedFiles: [],
    changeSet: {
      attemptedFiles: input.attemptedFiles,
      changedFiles: input.changedFiles,
      failedFiles: input.failedFiles,
    },
  };
}
