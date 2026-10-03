import { describe, expect, it } from "vitest";
import type { CodingResultSummary } from "../result/types.js";
import { buildMutationContinuityState } from "./mutationContinuityState.js";

describe("buildMutationContinuityState", () => {
  it("removes only older failures with later same-file changed and verified evidence", () => {
    const old = makeCodingResult({ attemptedFiles: ["a.ts", "b.ts"], changedFiles: [], verifiedFiles: [],
      failedFiles: [{ path: " a.ts ", reason: "old failure" }, { path: "b.ts", reason: "unresolved" }] });
    const current = makeCodingResult({ attemptedFiles: ["a.ts"], changedFiles: [" a.ts "], verifiedFiles: ["a.ts"], failedFiles: [], verificationStatus: "passed" });
    expect(buildMutationContinuityState({ lastCodingResult: current, recentCodingResults: [current, old] }).recentFailedFiles)
      .toEqual([{ path: "b.ts", reason: "unresolved" }]);
    expect(buildMutationContinuityState({ lastCodingResult: old, recentCodingResults: [old, current] }).recentFailedFiles)
      .toEqual([{ path: "a.ts", reason: "old failure" }, { path: "b.ts", reason: "unresolved" }]);
  });

  it("accepts top-level passed when the seed carries a command without a status", () => {
    const old = makeCodingResult({ attemptedFiles: ["a.ts"], changedFiles: [], verifiedFiles: [],
      failedFiles: [{ path: "a.ts", reason: "old failure" }] });
    const current = { ...makeCodingResult({ attemptedFiles: ["a.ts"], changedFiles: ["a.ts"], verifiedFiles: ["a.ts"],
      failedFiles: [], verificationStatus: "passed" }), lastActionResultSeed: { actionKind: "edit-file" as const,
      target: "a.ts", changedFiles: ["a.ts"], verifiedFiles: ["a.ts"], verification: { command: "check-a" } } };
    expect(buildMutationContinuityState({ lastCodingResult: current, recentCodingResults: [current, old] }).recentFailedFiles).toEqual([]);
  });

  it.each(["unrelated", "unchanged", "unverified", "blocked", "contradictory", "unknown", "inspection", "seed-blocked"])(
    "does not resolve a known failure using %s success evidence", kind => {
      const old = makeCodingResult({ attemptedFiles: ["a.ts"], changedFiles: [], verifiedFiles: [],
        failedFiles: [{ path: "a.ts", reason: "old failure" }] });
      const target = kind === "unrelated" ? "b.ts" : "a.ts";
      const current = { ...makeCodingResult({ attemptedFiles: [target], changedFiles: kind === "unchanged" ? [] : [target],
        verifiedFiles: kind === "unverified" ? [] : [target], failedFiles: [], verificationStatus: kind === "blocked" ? "blocked" : "passed" }),
        ...(kind === "contradictory" ? { unverifiedFiles: [{ path: target, reason: "not inspected" }] } : {}),
        ...(kind === "unknown" ? { evidence: ["writer-started-no-success", "write-effect:unknown"] } : {}),
        ...(kind === "inspection" ? { evidence: ["user-inspection-required"] } : {}),
        ...(kind === "seed-blocked" ? { lastActionResultSeed: { actionKind: "edit-file" as const, target,
          changedFiles: [target], verifiedFiles: [target], verification: { status: "blocked" as const } } } : {}),
      };
      expect(buildMutationContinuityState({ lastCodingResult: current, recentCodingResults: [current, old] }).recentFailedFiles)
        .toEqual([{ path: "a.ts", reason: "old failure" }]);
    });

  it.each(["unknown", "unverified"])("does not silently resolve an older %s write", writeEffect => {
    const old = { ...makeCodingResult({ attemptedFiles: ["a.ts"], changedFiles: [], verifiedFiles: [],
      failedFiles: [{ path: "a.ts", reason: "inspect earlier write" }] }), evidence: ["writer-started-no-success", `write-effect:${writeEffect}`] };
    const current = makeCodingResult({ attemptedFiles: ["a.ts"], changedFiles: ["a.ts"], verifiedFiles: ["a.ts"], failedFiles: [], verificationStatus: "passed" });
    expect(buildMutationContinuityState({ lastCodingResult: current, recentCodingResults: [current, old] }).recentFailedFiles)
      .toEqual([{ path: "a.ts", reason: "inspect earlier write" }]);
  });

  it("deduplicates trimmed failure paths with the newest reason and limits display to eight", () => {
    const current = makeCodingResult({ attemptedFiles: [], changedFiles: [], verifiedFiles: [], failedFiles: [
      { path: " ", reason: "blank" }, { path: " a.ts ", reason: "newest" }, { path: "a.ts", reason: "duplicate" },
      ...Array.from({ length: 10 }, (_, i) => ({ path: `${i}.ts`, reason: `failure ${i}` })),
    ] });
    const old = { ...current, failedFiles: [{ path: "a.ts", reason: "oldest" }] };
    const failed = buildMutationContinuityState({ recentCodingResults: [current, old] }).recentFailedFiles;
    expect(failed).toEqual([{ path: "a.ts", reason: "newest" }, ...Array.from({ length: 7 }, (_, i) => ({ path: `${i}.ts`, reason: `failure ${i}` }))]);
  });

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
  readonly verificationStatus?: "passed" | "blocked";
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
    verification: { status: input.verificationStatus ?? "blocked" },
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
