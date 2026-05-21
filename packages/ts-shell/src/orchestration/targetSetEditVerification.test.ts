import { describe, expect, it } from "vitest";
import { aggregateTargetSetEditVerification } from "./targetSetEditVerification.js";

describe("targetSetEditVerification", () => {
  it("aggregates full success", () => {
    const aggregate = aggregateTargetSetEditVerification({
      changedFiles: ["src/a.ts", "src/b.ts"],
      fileResults: [
        fileResult("src/a.ts", "written"),
        fileResult("src/b.ts", "written"),
      ],
    });

    expect(aggregate.overallStatus).toBe("passed");
    expect(aggregate.passedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(aggregate.evidence).toContain(
      "target-set-edit-verification:overall:passed",
    );
  });

  it("reports skipped and failed files without presenting partial success as full success", () => {
    const aggregate = aggregateTargetSetEditVerification({
      changedFiles: ["src/a.ts"],
      fileResults: [
        fileResult("src/a.ts", "written"),
        fileResult("src/b.ts", "failed"),
        fileResult("src/c.ts", "not-run"),
      ],
    });

    expect(aggregate.overallStatus).toBe("failed");
    expect(aggregate.failedFiles).toEqual(["src/b.ts"]);
    expect(aggregate.skippedFiles).toEqual(["src/c.ts"]);
    expect(aggregate.recoveryRecommendation).toContain(
      "explicit snapshot-backed recovery apply",
    );
    expect(JSON.stringify(aggregate)).not.toContain("status: draft");
  });
});

function fileResult(
  targetPath: string,
  status: "written" | "stopped" | "failed" | "not-run",
) {
  return {
    targetPath,
    status,
    changedFiles: status === "written" ? [targetPath] : [],
    reason: status === "written" ? undefined : "fixture failure",
    evidence: [`fixture:${targetPath}:${status}`],
  };
}
