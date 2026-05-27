import { describe, expect, it } from "vitest";

import {
  shouldDegradeCrossFileRemaining,
  shouldRetainCrossFileFailureInRemaining,
} from "./crossFileRepairPlanning.js";

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
});
