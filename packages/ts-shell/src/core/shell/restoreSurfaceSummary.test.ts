import { describe, expect, it } from "vitest";
import type { CodingResultSummary } from "../../result/types.js";
import { formatExplicitRestoreSummaryLines } from "./restoreSurfaceSummary.js";

describe("restore surface summary", () => {
  it("mentions explicit guarded restore availability for captured authority failures", () => {
    const lines = formatExplicitRestoreSummaryLines({
      ...baseCodingResult(),
      failedFiles: [{ path: "src/a.ts", reason: "partial-mutation-failed" }],
      recoverySurface: {
        recoveryAvailable: true,
        explicitRestoreAvailable: true,
        automaticRecoveryAvailable: false,
        atomicRollbackAvailable: false,
        recoveryExecuted: false,
        restorableFiles: ["src/a.ts"],
        blockedFiles: [],
        recoveryAuthorityId: "route-summary",
        routeId: "route-66",
        recoveryAction: "preview-restore",
        userFacingMessage:
          "Explicit guarded restore may be available for captured recovery authority. No automatic recovery ran.",
        evidence: ["recovery-surface:captured-authority-summary"],
      },
    });

    expect(lines.join("\n")).toContain("Restore preview: available");
    expect(lines.join("\n")).toContain("Restore candidates: src/a.ts");
    expect(lines.join("\n")).toContain("Restore authority: route-summary");
    expect(lines.join("\n")).toContain("atomic rollback is unavailable");
    expect(lines.join("\n")).not.toContain("original content");
  });

  it("does not claim restore availability when authority is absent", () => {
    const lines = formatExplicitRestoreSummaryLines({
      ...baseCodingResult(),
      failedFiles: [{ path: "src/a.ts", reason: "blocked" }],
    });

    expect(lines).toEqual([]);
  });

  it("keeps success paths quiet", () => {
    const lines = formatExplicitRestoreSummaryLines({
      ...baseCodingResult(),
      changedFiles: ["src/a.ts"],
      recoverySurface: {
        recoveryAvailable: true,
        explicitRestoreAvailable: true,
        automaticRecoveryAvailable: false,
        atomicRollbackAvailable: false,
        recoveryExecuted: false,
        restorableFiles: ["src/a.ts"],
        blockedFiles: [],
        recoveryAuthorityId: "route-summary",
        routeId: "route-66",
        recoveryAction: "preview-restore",
        userFacingMessage:
          "Explicit guarded restore may be available for captured recovery authority. No automatic recovery ran.",
        evidence: ["recovery-surface:captured-authority-summary"],
      },
    });

    expect(lines).toEqual([]);
  });
});

function baseCodingResult(): CodingResultSummary {
  return {
    taskKind: "edit-file",
    changedFiles: [],
    failedFiles: [],
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
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [],
      attemptedFiles: [],
      changedFiles: [],
      unchangedAttemptedFiles: [],
    },
    taskSatisfaction: {
      verdict: "insufficient-evidence",
      reasons: [],
      requiredEvidence: [],
      observedEvidence: [],
    },
    verifiedFiles: [],
    unverifiedFiles: [],
    verification: {
      status: "blocked",
    },
    evidence: [],
  };
}
