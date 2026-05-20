import { describe, expect, it } from "vitest";
import {
  analyzeApprovalModeConflict,
  applyPatchDecisionFromApprovalMode,
  materializeApprovalModeObject,
} from "./cliApprovalModule.js";
import {
  hasBlockedRootBindingDiagnostic,
  resolveSessionSwitchDiagnostics,
} from "./cliSessionModule.js";
import {
  isWorkspaceInfoPromptStrict,
  normalizePathForCompare,
} from "./cliWorkspaceModule.js";

describe("CLI module facades", () => {
  it("projects apply-patch approval decisions without broadening states", () => {
    expect(applyPatchDecisionFromApprovalMode("deny")).toBe("denied");
    expect(applyPatchDecisionFromApprovalMode("allow-once")).toBe("approved");
    expect(applyPatchDecisionFromApprovalMode("allow-always")).toBe("approved");
    expect(applyPatchDecisionFromApprovalMode(undefined)).toBeUndefined();
  });

  it("materializes approval-mode objects only with verify continuation lineage", () => {
    const continuation = {
      lastVerificationResumeEligible: true,
      lastVerificationCommand: "npm test",
      lastContinuationEvidence: [
        "verify-resume-eligible:true",
        "verify-cwd-hint:/repo",
        "verify-target-hint:src/app.ts",
      ],
      recentTargetFiles: ["fallback.ts"],
    };

    expect(
      materializeApprovalModeObject({
        prompt: "continue verification, allow once",
        continuity: continuation,
      }),
    ).toMatchObject({
      mode: "allow-once",
      source: "prompt-explicit-verify-lineage",
      command: "npm test",
      commandCwd: "/repo",
      targetPath: "src/app.ts",
      executableNow: true,
      missingFields: [],
    });

    const ambiguous = materializeApprovalModeObject({
      prompt: "retry tests allow once and always allow",
      continuity: continuation,
    });
    expect(ambiguous).toMatchObject({
      mode: "deny",
      source: "prompt-ambiguous-verify-lineage",
      executableNow: false,
      missingFields: ["approval-mode"],
    });
    expect(analyzeApprovalModeConflict(ambiguous).ambiguousStop).toBe(true);
  });

  it("keeps session switch diagnostics scoped to root-binding mismatch", () => {
    expect(
      resolveSessionSwitchDiagnostics(
        { projectRoot: "/repo", requestedWorkspaceRoot: "/repo" },
        { id: "sess_same", projectRoot: "/repo" },
      ),
    ).toEqual([]);

    const diagnostics = resolveSessionSwitchDiagnostics(
      { projectRoot: "/repo", requestedWorkspaceRoot: "/requested" },
      { id: "sess_other", projectRoot: "/other" },
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      severity: "blocked",
      code: "root-binding-session-mismatch",
    });
    expect(diagnostics[0]?.explanation).toContain("Session sess_other");
    expect(hasBlockedRootBindingDiagnostic(diagnostics)).toBe(true);
  });

  it("keeps workspace prompt classification read-only and question-shaped", () => {
    expect(isWorkspaceInfoPromptStrict("where am I?")).toBe(true);
    expect(isWorkspaceInfoPromptStrict("当前工作目录在哪里？")).toBe(true);
    expect(isWorkspaceInfoPromptStrict("write a file in current directory")).toBe(
      false,
    );
    expect(isWorkspaceInfoPromptStrict("current directory")).toBe(false);
    expect(normalizePathForCompare("/Repo/./src")).toBe(
      normalizePathForCompare("/repo/src"),
    );
  });
});
