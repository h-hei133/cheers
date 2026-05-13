import { describe, expect, it } from "vitest";
import {
  buildReflectiveStateQueryResponse,
  buildRepairContinuationObject,
  buildVerifyContinuationObject,
  deriveContinuationTargetPath,
  inferVerifyCommandFromContinuity,
  isVerifyResumeEligibleFromContinuity,
} from "./continuationPlanning.js";

describe("continuationPlanning", () => {
  it("projects reflective next-step guidance from verification continuity", () => {
    const continuity = {
      lastVerificationStatus: "blocked" as const,
      lastVerificationCommand: "npm test -- --help",
      lastVerificationReason: "approval denied for test command",
      lastVerificationBlockerKind: "approval-denied" as const,
      recentTargetFiles: ["src/app.ts"],
    };

    expect(
      buildReflectiveStateQueryResponse({
        kind: "next-step",
        continuity,
        workspaceRoot: process.cwd(),
      }),
    ).toContain(
      "Recommended next step: rerun verification command (npm test -- --help) after resolving blocker (approval-denied).",
    );
  });

  it("derives continuation target and verify command without session or tool execution", () => {
    const continuity = {
      lastTaskKind: "edit-file" as const,
      recentTargetFiles: ["./src/app.ts"],
      lastContinuationEvidence: [
        "verify-command-hint:npm run build -- --help",
        "verify-resume-eligible:true",
      ],
    };

    expect(deriveContinuationTargetPath(continuity, process.cwd())).toBe(
      "src/app.ts",
    );
    expect(inferVerifyCommandFromContinuity(continuity)).toBe(
      "npm run build -- --help",
    );
    expect(isVerifyResumeEligibleFromContinuity(continuity)).toBe(true);
  });

  it("builds repair and verify continuation objects with missing-field diagnostics", () => {
    const continuity = {
      lastFailure: "Replace source text not found",
      lastTerminalReason: "stopped_error" as const,
      lastContinuationEvidence: [
        "transform:src/app.ts:old=>new",
        "verify-target-hint:src/app.ts",
      ],
    };

    expect(
      buildRepairContinuationObject({
        continuity,
        targetPath: "src/app.ts",
        replaceDirective: { from: "old", to: "new" },
      }),
    ).toMatchObject({
      kind: "edit-fix",
      authority: "rebased-continuity-target",
      confidence: "high",
      executableNow: true,
      missingFields: [],
    });

    expect(
      buildVerifyContinuationObject({
        continuity,
        targetPath: "src/app.ts",
      }),
    ).toMatchObject({
      kind: "rerun-verify",
      authority: "rebased-continuity-target",
      confidence: "medium",
      executableNow: false,
      missingFields: ["command"],
    });
  });
});
