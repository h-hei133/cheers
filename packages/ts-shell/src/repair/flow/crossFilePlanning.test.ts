import { describe, expect, it } from "vitest";

import {
  deriveCrossFileRepairCandidates,
  extractCrossFileFailureEntriesFromContinuity,
  extractCrossFileStateListFromContinuityEvidence,
  hasCrossFileContinuationContextInContinuity,
  hasCrossFileEvidenceSignalInContinuity,
  shouldDegradeCrossFileRemaining,
  shouldRetainCrossFileFailureInRemaining,
} from "./crossFilePlanning.js";

describe("crossFileRepairPlanning", () => {
  it("retains patch-generation failures as remaining repair evidence", () => {
    expect(
      shouldRetainCrossFileFailureInRemaining(
        "patch-generation-failed",
        "Replace source text not found in target file.",
      ),
    ).toBe(true);
  });

  it("degrades repeated non-retriable remaining failures without hiding them", () => {
    const result = shouldDegradeCrossFileRemaining({
      previousRemainingTargets: ["src/locked.js"],
      previousFailedEntries: [
        {
          path: "src/locked.js",
          failureCode: "write-failed",
          reason: "permission denied",
        },
      ],
      currentRemainingTargets: ["src/locked.js"],
      currentFailedEntries: [
        {
          path: "src/locked.js",
          failureCode: "write-failed",
          reason: "permission denied",
        },
      ],
    });

    expect(result).toMatchObject({
      shouldDegrade: true,
      degradedTargets: ["src/locked.js"],
    });
  });

  it("keeps explicit remaining targets first and capped for follow-up planning", () => {
    const continuity = {
      lastContinuationEvidence: [
        "repair-remaining-files: src/a.test.ts, src/b.config.ts, src/c.ts",
      ],
    };

    expect(deriveCrossFileRepairCandidates(continuity, "src/main.ts")).toEqual([
      "src/a.test.ts",
      "src/b.config.ts",
    ]);
    expect(hasCrossFileEvidenceSignalInContinuity(continuity)).toBe(true);
    expect(hasCrossFileContinuationContextInContinuity(continuity)).toBe(true);
  });

  it("scores related repair candidates without reusing processed paths", () => {
    const continuity = {
      recentFailedFiles: [{ path: "src/main.test.ts", reason: "failed" }],
      recentChangedFiles: ["src/helper.ts", "docs/note.md"],
      recentTargetFiles: ["src/main.ts", "src/config.ts"],
      lastContinuationEvidence: ["repair-processed-files: src/helper.ts"],
    };

    expect(deriveCrossFileRepairCandidates(continuity, "src/main.ts")).toEqual([
      "src/main.test.ts",
      "src/config.ts",
    ]);
  });

  it("parses remaining and failed cross-file evidence conservatively", () => {
    const continuity = {
      lastContinuationEvidence: [
        "repair-remaining-files: ./src/a.ts, src/b.ts",
        "repair-failed-files: src/a.ts::patch-generation-failed::missing text|src/b.ts::unknown::ignored|src/c.ts::read-failed::ENOENT",
      ],
    };

    expect(
      extractCrossFileStateListFromContinuityEvidence(
        continuity,
        "repair-remaining-files:",
      ),
    ).toEqual(["src/a.ts", "src/b.ts"]);
    expect(extractCrossFileFailureEntriesFromContinuity(continuity)).toEqual([
      {
        path: "src/a.ts",
        failureCode: "patch-generation-failed",
        reason: "missing text",
      },
      { path: "src/c.ts", failureCode: "read-failed", reason: "ENOENT" },
    ]);
  });
});
