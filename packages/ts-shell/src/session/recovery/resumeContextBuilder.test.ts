import { describe, expect, it } from "vitest";
import type { CodingResultSummary } from "../../result/types.js";
import type { SessionContinuitySnapshot } from "../sessionContinuityTypes.js";
import {
  buildActionHandoffSummary,
  buildSeedInfluenceHandoffSummary,
  buildSessionResumeContext,
  buildSessionResumeSnapshot,
  buildSuccessHandoffDiagnostic,
  extractPathLikeTargets,
  shouldAutoAttachPathlessContinuation,
} from "./resumeContextBuilder.js";

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

  it("includes snapshot and explicit restore facts in success handoff diagnostics", () => {
    const diagnostic = buildSuccessHandoffDiagnostic({
      ...makeCodingResult(),
      recoverySurface: {
        recoveryAvailable: true,
        explicitRestoreAvailable: true,
        automaticRecoveryAvailable: false,
        atomicRollbackAvailable: false,
        recoveryExecuted: false,
        restorableFiles: ["src/a.ts"],
        blockedFiles: [],
        recoveryAuthorityId: "authority-success",
        recoveryAction: "preview-restore",
        userFacingMessage:
          "Explicit guarded restore may be available. No automatic recovery ran.",
        evidence: ["recovery-surface:explicit-restore-only"],
      },
    });

    expect(diagnostic).toContain("snapshot=created");
    expect(diagnostic).toContain("restore-preview=available");
    expect(diagnostic).toContain("automatic-rollback=no");
  });

  it("includes confirmed discovery handoff facts in success diagnostics", () => {
    const diagnostic = buildSuccessHandoffDiagnostic({
      ...makeCodingResult(),
      continuation: {
        status: "first-pass-success",
        attempts: 0,
        evidence: [
          "discovery-edit manifest=discovery-edit-def456; candidates=src/a.ts; ambiguity=single-candidate; confirmation=confirmed-single-target; mutation:not-run; mutationAuthority:not-granted; raw-content-excluded",
        ],
      },
    });

    expect(diagnostic).toContain(
      "discovery=discovery-edit manifest=discovery-edit-def456",
    );
    expect(diagnostic).toContain("confirmation=confirmed-single-target");
    expect(diagnostic).toContain("raw-content-excluded");
  });

  it("includes generated edit handoff facts in success diagnostics", () => {
    const diagnostic = buildSuccessHandoffDiagnostic({
      ...makeCodingResult(),
      continuation: {
        status: "first-pass-success",
        attempts: 0,
        evidence: [
          "generated-edit handoff=single-target-handoff; proposal=generated-edit-abc123; changed=src/a.ts; raw-content-excluded",
        ],
      },
    });

    expect(diagnostic).toContain(
      "generated=generated-edit handoff=single-target-handoff",
    );
    expect(diagnostic).toContain("proposal=generated-edit-abc123");
    expect(diagnostic).toContain("raw-content-excluded");
  });

  it("includes provider edit proposal facts in success diagnostics", () => {
    const diagnostic = buildSuccessHandoffDiagnostic({
      ...makeCodingResult(),
      continuation: {
        status: "first-pass-success",
        attempts: 0,
        evidence: [
          "provider-edit proposal=provider-edit-def456; provider=fake-provider; targets=src/a.ts; readiness=exact-single-target; confirmation=confirmed-exact-single-target; mutation:not-run; mutationAuthority:not-granted; raw-content-excluded",
        ],
      },
    });

    expect(diagnostic).toContain(
      "provider-edit=provider-edit proposal=provider-edit-def456",
    );
    expect(diagnostic).toContain("confirmation=confirmed-exact-single-target");
    expect(diagnostic).toContain("mutationAuthority:not-granted");
    expect(diagnostic).toContain("raw-content-excluded");
  });

  it("includes proposal review/apply facts in success diagnostics", () => {
    const diagnostic = buildSuccessHandoffDiagnostic({
      ...makeCodingResult(),
      continuation: {
        status: "first-pass-success",
        attempts: 0,
        evidence: [
          "edit-proposal-review proposal=provider-edit-def456; source=provider; status=ready-for-selection; targets=src/a.ts; readiness=single-target-ready; mutation:not-run; raw-content-excluded",
          "edit-proposal-apply proposal=provider-edit-def456; status=single-target-applied; targets=src/a.ts; changed=src/a.ts; raw-content-excluded",
          "proposal-hunk-set-apply proposal=provider-edit-def456; hunkSet=proposal-hunk-set-abc; status=written; targets=src/a.ts, src/b.ts; hunks=h1, h2; changed=src/a.ts, src/b.ts; failed=none; unattempted=none; verification=passed; recovery=not-needed; raw-content-excluded",
        ],
      },
    });

    expect(diagnostic).toContain(
      "proposal-review=edit-proposal-review proposal=provider-edit-def456",
    );
    expect(diagnostic).toContain(
      "proposal-apply=edit-proposal-apply proposal=provider-edit-def456",
    );
    expect(diagnostic).toContain(
      "proposal-hunk-set=proposal-hunk-set-apply proposal=provider-edit-def456",
    );
    expect(diagnostic).toContain("single-target-applied");
    expect(diagnostic).toContain("raw-content-excluded");
  });

  it("includes targeted context packet and plan facts in success diagnostics", () => {
    const diagnostic = buildSuccessHandoffDiagnostic({
      ...makeCodingResult(),
      taskKind: "read-file",
      changedFiles: [],
      verifiedFiles: [],
      continuation: {
        status: "first-pass-success",
        attempts: 0,
        evidence: [
          "context-packet ctx_def456; target=src/target.ts; included=4; omitted=0; confidence=high; mutationAuthority=not-granted",
          "context-plan ctx_def456; readiness=ready; suggestedReads=0; tests=1; mutationAuthority=not-granted",
          "agent-plan plan_def456; owner=workspace-file-context; action=context-planning; readiness=ready; confidence=high; contextPackets=1; missingFacts=0; suggestedReads=0; mutationAuthority=not-granted; redaction=redacted-and-budgeted",
        ],
      },
    });

    expect(diagnostic).toContain(
      "context-packet=context-packet ctx_def456",
    );
    expect(diagnostic).toContain("context-plan=context-plan ctx_def456");
    expect(diagnostic).toContain("agent-plan=agent-plan plan_def456");
    expect(diagnostic).toContain("mutationAuthority=not-granted");
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
