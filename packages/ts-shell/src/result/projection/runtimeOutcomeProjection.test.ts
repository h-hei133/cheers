import { describe, expect, it } from "vitest";
import {
  projectBlockedRuntimeOutcome,
  projectRuntimeCodingOutcome,
  projectRuntimeMutationOutcome,
} from "./runtimeOutcomeProjection.js";

describe("runtime outcome projection", () => {
  it("projects blocked workflow outcomes with actionable handoff data", () => {
    const result = projectBlockedRuntimeOutcome({
      taskKind: "edit-file",
      blockedReason: "patch-from-not-found: source text missing",
      targetPath: "src/a.ts",
      freshnessEvidence: ["freshness:ok"],
      previousRemainingTargets: ["src/b.ts"],
      previousFailedEntries: [
        {
          path: "src/b.ts",
          failureCode: "patch-generation-failed",
          reason: "x".repeat(90),
        },
      ],
      degradedReopenReason: "target recovery is ambiguous",
      degradedReopenCandidates: ["src/c.ts", "src/d.ts"],
      degradedReopenCandidateSource: "continuity",
      degradedReopenCandidatePruned: ["src/e.ts"],
    });

    expect(result.userFacingOutput).toContain("Outcome: blocked");
    expect(result.userFacingOutput).toContain(
      "BlockerKind: patch-from-not-found",
    );
    expect(result.codingResult.changedFiles).toEqual([]);
    expect(result.codingResult.failedFiles).toEqual([
      {
        path: "src/a.ts",
        reason: "patch-from-not-found: source text missing",
      },
    ]);
    expect(result.codingResult.verification.status).toBe("skipped");
    expect(result.codingResult.verification.nextAction).toBe(
      "Provide the exact current source text from the target file, then rerun the patch.",
    );
    expect(result.codingResult.evidence).toEqual(
      expect.arrayContaining([
        "workflow blocked before mutation",
        "repair-remaining-files:src/b.ts,src/c.ts,src/d.ts",
        "reopen-reason:target recovery is ambiguous",
        "reopen-candidates:src/c.ts,src/d.ts",
        "why-not-auto-select:multi-candidate-ambiguous",
        "repair-outcome:blocked-disambiguation",
      ]),
    );
    expect(
      result.codingResult.evidence.find((entry) =>
        entry.startsWith("repair-failed-files:"),
      ),
    ).toContain(`${"x".repeat(80)}...`);
  });

  it("projects successful mutation outcomes without dropping changed files", () => {
    const result = projectRuntimeMutationOutcome({
      taskKind: "edit-file",
      changedFiles: ["src/a.ts"],
      failedFiles: [],
      patches: [],
      verifiedFiles: ["src/a.ts"],
      unverifiedFiles: [],
      verification: {
        status: "passed",
        reason: "verify completed",
        selectionScope: "focused",
        selectionSource: "explicit-user",
      },
      repairNotes: [],
      evidence: ["attempted-file:src/a.ts"],
      degradedCrossFileTargets: [],
      crossFileRemainingTargets: [],
      crossFileFailedByReason: [],
      crossFileSkippedFiles: [],
    });

    expect(result.codingResult.changedFiles).toEqual(["src/a.ts"]);
    expect(result.codingResult.failedFiles).toEqual([]);
    expect(result.codingResult.verification.status).toBe("passed");
    expect(result.codingResult.lastActionResultSeed?.changedFiles).toEqual([
      "src/a.ts",
    ]);
    expect(result.userFacingOutput).toContain("Edit completed for src/a.ts.");
  });

  it("projects stopped coding outcomes with failed files and action-result seed", () => {
    const result = projectRuntimeCodingOutcome({
      taskKind: "edit-file",
      changedFiles: [],
      failedFiles: [
        {
          path: "src/a.ts",
          reason: "patch-generation-failed: unified diff missing",
        },
      ],
      patches: [],
      verifiedFiles: [],
      unverifiedFiles: [],
      verification: {
        status: "skipped",
        reason: "mutation instruction missing",
      },
      repairNotes: ["mutation instruction missing"],
      evidence: ["attempted-file:src/a.ts"],
      taskVerdict: "insufficient-evidence",
      taskReasons: ["patch-generation-failed: unified diff missing"],
      userFacingOutput:
        "Task not completed: patch-generation-failed: unified diff missing",
    });

    expect(result.codingResult.changedFiles).toEqual([]);
    expect(result.codingResult.failedFiles).toEqual([
      {
        path: "src/a.ts",
        reason: "patch-generation-failed: unified diff missing",
      },
    ]);
    expect(result.codingResult.taskSatisfaction.verdict).toBe(
      "insufficient-evidence",
    );
    expect(result.codingResult.lastActionResultSeed?.target).toBe("src/a.ts");
    expect(result.userFacingOutput).toBe(
      "Task not completed: patch-generation-failed: unified diff missing",
    );
  });
});
