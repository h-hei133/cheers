import { describe, expect, it } from "vitest";
import type { CodingResultSummary } from "../orchestration/types.js";
import type { SessionContinuitySnapshot } from "./SessionManager.js";
import {
  buildActionHandoffSummary,
  buildSeedInfluenceHandoffSummary,
  buildSessionResumeContext,
  buildSessionResumeSnapshot,
  buildSuccessHandoffDiagnostic,
  extractPathLikeTargets,
  shouldAutoAttachPathlessContinuation,
} from "./sessionResumeContextBuilder.js";

describe("session resume context builder", () => {
  it("builds explicit continuation context without changing planned/changed distinctions", () => {
    const snapshot = makeSnapshot({
      lastTerminalClassification: "stopped",
      lastTerminalReason: "stopped_error",
      lastWriterStarted: false,
      lastWriteEffectTarget: "src/a.ts, src/b.ts, src/c.ts",
      recentTargetFiles: ["src/a.ts", "src/b.ts", "src/c.ts"],
      recentChangedFiles: [],
      recentFailedFiles: [
        { path: "src/a.ts", reason: "3-file writes are unsupported" },
        { path: "src/b.ts", reason: "3-file writes are unsupported" },
        { path: "src/c.ts", reason: "3-file writes are unsupported" },
      ],
      lastFailureHandoffDiagnostic:
        "Failure handoff: status=blocked; target=src/a.ts, src/b.ts, src/c.ts.",
      lastTaskSatisfactionReasons: ["unsupported 3-file write"],
      unresolvedItems: ["verify:blocked"],
      freshnessHistoryCount: 4,
    });

    const context = buildSessionResumeContext({
      currentPrompt: "continue from the previous failure",
      snapshot,
    });

    expect(context).toContain("- last-terminal: stopped (stopped_error)");
    expect(context).toContain("- last-writer-started: no");
    expect(context).toContain(
      "- last-write-effect-target: src/a.ts, src/b.ts, src/c.ts",
    );
    expect(context).toContain(
      "- recent-target-files: src/a.ts, src/b.ts, src/c.ts",
    );
    expect(context).toContain(
      "- recent-failed-files: src/a.ts (3-file writes are unsupported), src/b.ts (3-file writes are unsupported), src/c.ts (3-file writes are unsupported)",
    );
    expect(context).not.toContain("- recent-changed-files:");
  });

  it("returns a boundary-only snapshot for non-continuation prompts with history", () => {
    const snapshot = makeSnapshot({
      lastUserIntent: "update src/a.ts",
      lastFailure: "verification blocked",
      lastTerminalClassification: "stopped",
      lastTerminalReason: "stopped_error",
      lastWriterStarted: true,
      lastWriteEffect: "unknown",
      recentChangedFiles: ["src/a.ts"],
      recentTargetFiles: ["src/a.ts", "src/b.ts"],
      recentVerifiedFiles: ["src/a.ts"],
      recentFailedFiles: [{ path: "src/b.ts", reason: "write failed" }],
      lastTaskSatisfactionReasons: ["blocked"],
      unresolvedItems: ["failed-files:src/b.ts"],
      freshnessHistoryCount: 7,
    });

    const projected = buildSessionResumeSnapshot({
      currentPrompt: "start a separate new topic",
      snapshot,
    });

    expect(projected).toMatchObject({
      sessionId: "sess_test",
      projectRoot: "/tmp/project",
      lastFailure: "verification blocked",
      lastTerminalClassification: "stopped",
      lastTerminalReason: "stopped_error",
      lastWriterStarted: true,
      lastWriteEffect: "unknown",
      freshnessHistoryCount: 7,
    });
    expect(projected?.recentChangedFiles).toEqual([]);
    expect(projected?.recentTargetFiles).toEqual([]);
    expect(projected?.recentFailedFiles).toEqual([]);
    expect(projected?.recentVerifiedFiles).toEqual([]);
    expect(projected?.lastTaskSatisfactionReasons).toEqual(["blocked"]);
    expect(projected?.unresolvedItems).toEqual([]);
  });

  it("auto-attaches pathless follow-up only when prior task context exists", () => {
    const withContext = makeSnapshot({
      lastTaskKind: "edit-file",
      recentTargetFiles: ["src/a.ts"],
      unresolvedItems: ["verify:blocked"],
    });
    const withoutContext = makeSnapshot();

    expect(shouldAutoAttachPathlessContinuation("next", withContext)).toBe(
      true,
    );
    expect(shouldAutoAttachPathlessContinuation("next", withoutContext)).toBe(
      false,
    );
    expect(
      shouldAutoAttachPathlessContinuation("next in src/other.ts", withContext),
    ).toBe(false);
  });

  it("projects action-result and seed-influence handoff text", () => {
    const seed = {
      actionKind: "edit-file",
      target: "src/a.ts",
      changedFiles: ["src/a.ts"],
      verifiedFiles: ["src/a.ts"],
      writerStarted: true,
      writeEffect: "verified",
      requiresUserInspection: true,
      verification: { status: "passed" },
    } as const;

    expect(buildActionHandoffSummary(seed)).toBe(
      "Resumed from edit-file on src/a.ts; verification status: passed; writer-started=yes; write-effect=verified; requires-user-inspection=yes; next focus is the same target.",
    );
    expect(buildSeedInfluenceHandoffSummary(seed, "verify-signal")).toBe(
      "Seed influence: verify-signal from edit-file on src/a.ts.",
    );
  });

  it("builds success handoff diagnostics from passed verification", () => {
    const diagnostic = buildSuccessHandoffDiagnostic(makeCodingResult());

    expect(diagnostic).toContain("Success handoff: status=passed");
    expect(diagnostic).toContain("target=src/a.ts");
    expect(diagnostic).toContain("command=npm test");
    expect(diagnostic).toContain("verified=src/a.ts");
    expect(diagnostic).toContain("next=keep the next turn focused");
  });

  it("extracts path-like targets for prompt routing", () => {
    expect(extractPathLikeTargets("continue in src/a.ts and ./b.test.ts")).toEqual([
      "./b.test.ts",
      "src/a.ts",
    ]);
    expect(extractPathLikeTargets("continue with that")).toEqual([]);
  });
});

function makeSnapshot(
  overrides: Partial<SessionContinuitySnapshot> = {},
): SessionContinuitySnapshot {
  return {
    sessionId: "sess_test",
    projectRoot: "/tmp/project",
    recentChangedFiles: [],
    recentTargetFiles: [],
    recentFailedFiles: [],
    recentVerifiedFiles: [],
    lastRepairNotes: [],
    lastContinuationEvidence: [],
    lastTaskSatisfactionReasons: [],
    unresolvedItems: [],
    ...overrides,
  };
}

function makeCodingResult(): CodingResultSummary {
  return {
    taskKind: "edit-file",
    changedFiles: ["src/a.ts"],
    failedFiles: [],
    patches: [{ path: "src/a.ts", operation: "update", status: "applied" }],
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
      selectedTarget: "src/a.ts",
      remainingTargets: [],
      failedTargets: [],
    },
    verification: {
      status: "passed",
      command: "npm test",
      reason: "all tests passed",
    },
    taskSatisfaction: { verdict: "satisfied", reasons: [] },
    evidence: [],
    verifiedFiles: ["src/a.ts"],
    unverifiedFiles: [],
    changeSet: {
      attemptedFiles: ["src/a.ts"],
      changedFiles: ["src/a.ts"],
      failedFiles: [],
    },
  };
}
