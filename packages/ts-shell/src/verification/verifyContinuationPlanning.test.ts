import { describe, expect, it } from "vitest";

import {
  buildVerifyContinuationPlanning,
  isPostEditReadOnlyVerifyFollowUp,
  isVerifyContinuationFollowUpPrompt,
  prefersTestOverBuildInFollowUp,
} from "./verifyContinuationPlanning.js";

describe("verifyContinuationPlanning", () => {
  it("keeps verify/test prompt preferences in verification owner", () => {
    expect(isVerifyContinuationFollowUpPrompt("rerun the tests")).toBe(true);
    expect(prefersTestOverBuildInFollowUp("run tests first")).toBe(true);
    expect(
      isPostEditReadOnlyVerifyFollowUp("check the previous change contains foo"),
    ).toBe(true);
  });

  it("plans executable verify continuation without claiming success", () => {
    const result = buildVerifyContinuationPlanning({
      continuity: {
        lastVerificationStatus: "failed",
        lastVerificationCommand: "npm test -- --help",
      },
      primaryTargetPath: "src/a.ts",
      primaryTargetInWorkspace: true,
      effectiveVerifyCommand: "npm test -- --help",
      hasVerifyContinuationCue: true,
      hasDiagnosticVerifyHandoffCue: false,
      hasReflectiveActionCue: false,
      hasVerifyIntent: true,
      hasExecutionCorrectionCue: true,
      lastTaskHadVerifySignal: true,
      workspaceRoot: "/workspace",
      usedRestoredState: true,
      continuationLineage: ["seedInfluence=verify-signal"],
    });

    expect(result.plan).toMatchObject({
      taskKind: "run-command",
      reason: "verify continuation resolved from structured blocker/failure lineage",
      directCommand: "npm test -- --help",
      targetPath: "src/a.ts",
      verifyAfterEdit: false,
      usedRestoredState: true,
      continuationLineage: ["seedInfluence=verify-signal"],
    });
  });

  it("blocks verify continuation when command evidence is missing", () => {
    const result = buildVerifyContinuationPlanning({
      continuity: { lastVerificationStatus: "failed" },
      primaryTargetPath: "src/a.ts",
      primaryTargetInWorkspace: true,
      hasVerifyContinuationCue: true,
      hasDiagnosticVerifyHandoffCue: false,
      hasReflectiveActionCue: false,
      hasVerifyIntent: true,
      hasExecutionCorrectionCue: true,
      lastTaskHadVerifySignal: true,
      workspaceRoot: "/workspace",
      usedRestoredState: false,
    });

    expect(result.plan).toMatchObject({
      taskKind: "run-command",
      reason:
        "verify continuation requested, but structured verify object is incomplete",
      blockedReason: "Verify continuation is unavailable: missing command.",
      targetMissing: false,
    });
  });

  it("blocks verify continuation when cwd authority does not match workspace", () => {
    const result = buildVerifyContinuationPlanning({
      continuity: {
        lastVerificationStatus: "failed",
        lastContinuationEvidence: ["verify-cwd-hint:/other"],
      },
      primaryTargetPath: "src/a.ts",
      primaryTargetInWorkspace: true,
      effectiveVerifyCommand: "npm test -- --help",
      hasVerifyContinuationCue: true,
      hasDiagnosticVerifyHandoffCue: false,
      hasReflectiveActionCue: false,
      hasVerifyIntent: true,
      hasExecutionCorrectionCue: true,
      lastTaskHadVerifySignal: true,
      workspaceRoot: "/workspace",
      usedRestoredState: false,
    });

    expect(result.plan).toMatchObject({
      taskKind: "run-command",
      reason:
        "verify continuation requested, but structured verify object points to a different workspace authority",
      blockedReason:
        "Verify continuation is unavailable: rebased workspace authority mismatch for verify command cwd.",
    });
  });
});
