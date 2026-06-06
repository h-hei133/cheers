import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  CodingResultSummary,
  OrchestrationResult,
} from "../orchestration/types.js";
import { createQueryRuntimeStateFromSeed } from "../core/query/runtime/state.js";
import { decideQueryRuntimeAction } from "../core/query/runtime/policy.js";
import { buildMultiFileUpdatePlanningRouteResult } from "../edit/patch/plan/result.js";
import type { MultiFileUpdatePlanningClassification } from "../edit/patch/plan/multiFile.js";
import { SessionManager, type Session } from "./SessionManager.js";

describe("mutation compact continuity", () => {
  const originalUserProfile = process.env.USERPROFILE;
  const originalHome = process.env.HOME;
  let fakeHome: string;

  beforeEach(() => {
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "private-agents-mutation-compact-"));
    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;
  });

  afterEach(() => {
    process.env.USERPROFILE = originalUserProfile;
    process.env.HOME = originalHome;
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  it("preserves two-file mutation success changedFiles across compact-equivalent reload and follow-up", () => {
    const manager = new SessionManager();
    const session = createSeededMutationSession(manager, "update two files");
    const result = makeMutationSuccessResult(session);

    appendUntilAutoCompact(manager, session, result);
    manager.saveCompleted(session.id, {
      terminalReason: "completed",
      terminalClassification: "success",
    });

    const restoredManager = new SessionManager();
    const snapshot = restoredManager.buildContinuitySnapshot(session.id);
    const context = restoredManager.buildPromptContinuityContext(
      session.id,
      "continue: what changed just now?",
    );
    const state = readState(restoredManager, session.id);

    expect(state.workingMemory?.compacted).toBe(true);
    expect(snapshot.lastTerminalClassification).toBe("success");
    expect(snapshot.recentChangedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(snapshot.recentVerifiedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(snapshot.recentFailedFiles).toEqual([]);
    expect(snapshot.lastVerificationStatus).toBe("passed");
    expect(snapshot.lastSuccessHandoffDiagnostic).toContain(
      "Success handoff: status=passed",
    );
    expect(snapshot.lastSuccessHandoffDiagnostic).toContain(
      "verified=src/a.ts,src/b.ts",
    );
    expect(snapshot.lastFailureHandoffDiagnostic).toBeUndefined();
    expect(context).toContain("- recent-changed-files: src/a.ts, src/b.ts");
    expect(context).toContain("- recent-verified-files: src/a.ts, src/b.ts");
    expect(context).toContain("verified=src/a.ts,src/b.ts");
    expect(context).not.toContain("- recent-failed-files:");
    expect(context).not.toContain("partial-mutation-failed");
  });

  it("preserves two-file partial failure stopped state across compact-equivalent reload and follow-up", () => {
    const manager = new SessionManager();
    const session = createSeededMutationSession(manager, "update two files");
    const result = makeMutationPartialFailureResult(session);

    appendUntilAutoCompact(manager, session, result);
    manager.saveError(session.id, partialStopReason, {
      terminalReason: "stopped_error",
      terminalClassification: "stopped",
    });

    const restoredManager = new SessionManager();
    const snapshot = restoredManager.buildContinuitySnapshot(session.id);
    const context = restoredManager.buildPromptContinuityContext(
      session.id,
      "continue: what is the current mutation state?",
    );
    const state = readState(restoredManager, session.id);

    expect(state.workingMemory?.compacted).toBe(true);
    expect(snapshot.lastTerminalClassification).toBe("stopped");
    expect(snapshot.lastFailure).toBe(partialStopReason);
    expect(snapshot.lastWriterStarted).toBe(true);
    expect(snapshot.lastWriteEffect).toBe("unknown");
    expect(snapshot.lastWriteRequiresUserInspection).toBe(true);
    expect(snapshot.recentChangedFiles).toEqual(["src/a.ts"]);
    expect(snapshot.recentVerifiedFiles).toEqual(["src/a.ts"]);
    expect(snapshot.recentFailedFiles).toEqual([
      { path: "src/b.ts", reason: partialFailedReason },
    ]);
    expect(snapshot.lastVerificationStatus).toBe("blocked");
    expect(snapshot.lastVerificationBlockerKind).toBe("partial-mutation-failed");
    expect(snapshot.lastVerificationNextAction).toBe(partialNextAction);
    expect(snapshot.lastFailureHandoffDiagnostic).toContain(
      "Failure handoff: status=blocked",
    );
    expect(snapshot.lastFailureHandoffDiagnostic).toContain(
      "blocker=partial-mutation-failed",
    );
    expect(snapshot.lastFailureHandoffDiagnostic).toContain("write-effect=unknown");
    expect(snapshot.lastSuccessHandoffDiagnostic).toBeUndefined();
    expect(context).toContain("- last-terminal: stopped (stopped_error)");
    expect(context).toContain("- last-writer-started: yes");
    expect(context).toContain("- last-write-effect: unknown");
    expect(context).toContain("- recent-changed-files: src/a.ts");
    expect(context).toContain(
      `- recent-failed-files: src/b.ts (${partialFailedReason})`,
    );
    expect(context).toContain(
      "- last-verification-blocker-kind: partial-mutation-failed",
    );
    expect(context).toContain(`- last-verification-next-action: ${partialNextAction}`);
    expect(context).toContain("requires-user-inspection=yes");
    expect(context).not.toContain("- last-terminal: success");
    expect(context).not.toContain("- recent-changed-files: src/a.ts, src/b.ts");
    expect(context).not.toContain("rollback succeeded");
    expect(context).not.toContain("atomic rollback");
  });

  it("restores compact task state into normal runtime discovery after failed verification", () => {
    const manager = new SessionManager();
    const session = createSeededMutationSession(manager, "update two files");
    const result = makeMutationPartialFailureResult(session);

    appendUntilAutoCompact(manager, session, result);
    manager.saveError(session.id, partialStopReason, {
      terminalReason: "stopped_error",
      terminalClassification: "stopped",
    });

    const restoredManager = new SessionManager();
    const seed = restoredManager.buildRuntimeStateSeed(session.id, {
      maxTurns: 4,
    });
    const state = createQueryRuntimeStateFromSeed(seed);
    const decision = decideQueryRuntimeAction(state);

    expect(seed.taskState).toMatchObject({
      source: "compact",
      changedFiles: ["src/a.ts"],
      verifiedFiles: ["src/a.ts"],
      unverifiedFiles: ["src/b.ts"],
      originalFailureClassification: "unknown",
      continuationSafety: { status: "safe" },
    });
    expect(seed.taskState?.proofGap).toContain("repair proof missing");
    expect(decision.nextAction).toBe("search");
    expect(decision.changedFiles).toEqual(["src/a.ts"]);
    expect(seed.taskState?.proofGap).toContain("repair proof missing");
  });

  it("preserves exactly-three planning no-write stopped state across compact-equivalent reload and follow-up", () => {
    const manager = new SessionManager();
    const session = createSeededMutationSession(
      manager,
      "update three files with apply_patch",
    );
    const result = makeThreeFilePlanningNoWriteResult(session);

    appendUntilAutoCompact(manager, session, result);
    manager.saveError(session.id, threeFileStopReason, {
      terminalReason: "stopped_error",
      terminalClassification: "stopped",
    });

    const restoredManager = new SessionManager();
    const snapshot = restoredManager.buildContinuitySnapshot(session.id);
    const context = restoredManager.buildPromptContinuityContext(
      session.id,
      "continue: what was planned before it stopped?",
    );
    const state = readState(restoredManager, session.id);

    expect(state.workingMemory?.compacted).toBe(true);
    expect(snapshot.lastTerminalClassification).toBe("stopped");
    expect(snapshot.lastFailure).toBe(threeFileStopReason);
    expect(snapshot.lastWriterStarted).toBe(false);
    expect(snapshot.lastWriteEffect).toBeUndefined();
    expect(snapshot.lastWriteEffectTarget).toBe("src/a.ts, src/b.ts, src/c.ts");
    expect(snapshot.recentChangedFiles).toEqual([]);
    expect(snapshot.recentTargetFiles).toEqual([
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
    ]);
    expect(snapshot.recentVerifiedFiles).toEqual([]);
    expect(snapshot.recentFailedFiles.map((entry) => entry.path)).toEqual([
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
    ]);
    expect(snapshot.lastVerificationStatus).toBe("blocked");
    expect(snapshot.lastFailureHandoffDiagnostic).toContain(
      "Failure handoff: status=blocked",
    );
    expect(snapshot.lastFailureHandoffDiagnostic).toContain(
      "target=src/a.ts, src/b.ts, src/c.ts",
    );
    expect(snapshot.lastFailureHandoffDiagnostic).toContain(
      "no-write route",
    );
    expect(snapshot.lastSuccessHandoffDiagnostic).toBeUndefined();
    expect(context).toContain("- last-terminal: stopped (stopped_error)");
    expect(context).toContain("- last-writer-started: no");
    expect(context).toContain(
      "- last-write-effect-target: src/a.ts, src/b.ts, src/c.ts",
    );
    expect(context).toContain(
      "- recent-target-files: src/a.ts, src/b.ts, src/c.ts",
    );
    expect(context).toContain(
      "- last-failure-handoff-diagnostic: Failure handoff: status=blocked",
    );
    expect(context).not.toContain("- recent-changed-files:");
    expect(context).not.toContain("- last-terminal: success");
    expect(context).not.toContain("rollback succeeded");
    expect(context).not.toContain("atomic rollback");
  });
});

const partialFailedReason = "write failed: EACCES";
const partialStopReason =
  "apply_patch multi-file workspace write stopped before success: src/b.ts failed after src/a.ts was verified.";
const partialNextAction =
  "Inspect/re-read both attempted files before retrying.";
const threeFileStopReason =
  "Exactly-three Update File patch passed selected-workspace planning/preflight in a no-write route; no writer was reachable.";
const threeFileNextAction =
  "No files were changed. Use the explicit selected-workspace write route with approval before writing three files.";

function createSeededMutationSession(
  manager: SessionManager,
  prompt: string,
): Session {
  const session = manager.createNew();
  manager.markRunStarted(session.id, prompt);
  manager.addTurn(session.id, { role: "user", content: prompt });
  manager.recordApprovalAuditDecision(session.id, {
    decision: "allow-once",
    decisionSource: "cli-policy",
    persistent: false,
    cacheEffect: "none",
    projectRoot: session.projectRoot,
    cacheKey: `${session.projectRoot.toLowerCase()}|apply_patch:workspace-write`,
    scopeLabel: "apply_patch/workspace-write",
    channel: "non-interactive",
    inputKey: "y",
  });
  return session;
}

function appendUntilAutoCompact(
  manager: SessionManager,
  session: Session,
  result: OrchestrationResult,
): void {
  for (let index = 0; index < 12; index += 1) {
    manager.appendQueryEvent(session.id, {
      type: "query.completed",
      result,
    });
  }
}

function makeMutationSuccessResult(session: Session): OrchestrationResult {
  const codingResult: CodingResultSummary = {
    taskKind: "edit-file",
    changedFiles: ["src/a.ts", "src/b.ts"],
    failedFiles: [],
    patches: [
      { path: "src/a.ts", operation: "update", status: "applied" },
      { path: "src/b.ts", operation: "update", status: "applied" },
    ],
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
      postRunDirtyFiles: ["src/a.ts", "src/b.ts"],
      attemptedFiles: ["src/a.ts", "src/b.ts"],
      changedFiles: ["src/a.ts", "src/b.ts"],
      unchangedAttemptedFiles: [],
    },
    taskSatisfaction: {
      verdict: "satisfied",
      reasons: [],
      requiredEvidence: ["readback verification"],
      observedEvidence: ["src/a.ts verified", "src/b.ts verified"],
    },
    verifiedFiles: ["src/a.ts", "src/b.ts"],
    unverifiedFiles: [],
    verification: {
      status: "passed",
      command: "readback verification",
    },
    evidence: [
      "apply-patch-multi-file-workspace-write-result:verified",
      "write-effect:verified",
    ],
    lastActionResultSeed: {
      actionKind: "edit-file",
      target: "src/a.ts, src/b.ts",
      changedFiles: ["src/a.ts", "src/b.ts"],
      verifiedFiles: ["src/a.ts", "src/b.ts"],
      writerStarted: true,
      writeEffect: "verified",
      verification: {
        status: "passed",
        command: "readback verification",
      },
    },
  };

  return {
    status: "completed",
    terminalReason: "completed",
    terminalClassification: "success",
    transcript: [],
    sharedContext: {
      sessionId: session.id,
      initialPrompt: "update two files",
      notes: [],
      handoffs: [],
    },
    finalOutput: "Updated src/a.ts and src/b.ts.",
    codingResult,
  };
}

function makeMutationPartialFailureResult(session: Session): OrchestrationResult {
  const codingResult: CodingResultSummary = {
    taskKind: "edit-file",
    changedFiles: ["src/a.ts"],
    failedFiles: [{ path: "src/b.ts", reason: partialFailedReason }],
    patches: [
      { path: "src/a.ts", operation: "update", status: "applied" },
      {
        path: "src/b.ts",
        operation: "update",
        status: "failed",
        reason: partialFailedReason,
      },
    ],
    repair: {
      status: "failed",
      attempts: 1,
      recoveredItems: ["src/a.ts"],
      failedItems: ["src/b.ts"],
      notes: [partialStopReason],
    },
    continuation: {
      status: "failed-after-bounded-continuation",
      attempts: 1,
      evidence: [],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: ["src/a.ts"],
      attemptedFiles: ["src/a.ts", "src/b.ts"],
      changedFiles: ["src/a.ts"],
      unchangedAttemptedFiles: ["src/b.ts"],
    },
    taskSatisfaction: {
      verdict: "completed-with-caveats",
      reasons: [partialStopReason],
      requiredEvidence: ["per-file readback verification"],
      observedEvidence: [
        "mutation-summary-blocker:partial-mutation-failed",
        `mutation-summary-next-action:${partialNextAction}`,
      ],
    },
    verifiedFiles: ["src/a.ts"],
    unverifiedFiles: [{ path: "src/b.ts", reason: partialFailedReason }],
    verification: {
      status: "blocked",
      reason: partialStopReason,
      blockerKind: "unknown",
      nextAction: partialNextAction,
    },
    evidence: [
      "actionable-blocker-kind:partial-mutation-failed",
      `actionable-blocker-next:${partialNextAction}`,
      "apply-patch-multi-file-workspace-write-result:writer-started-no-success",
      "apply-patch-multi-file-workspace-write-result:write-effect:unknown",
      "apply-patch-multi-file-workspace-write-result:user-inspection-required",
      "write-effect:unknown",
    ],
    failureBoundary: partialStopReason,
    lastActionResultSeed: {
      actionKind: "edit-file",
      target: "src/a.ts, src/b.ts",
      changedFiles: ["src/a.ts"],
      verifiedFiles: ["src/a.ts"],
      writerStarted: true,
      writeEffect: "unknown",
      requiresUserInspection: true,
      verification: {
        status: "blocked",
        reason: partialStopReason,
        blockerKind: "unknown",
      },
      reason: partialStopReason,
      blockerKind: "unknown",
    },
  };

  return {
    status: "stopped_error",
    terminalReason: "stopped_error",
    terminalClassification: "stopped",
    stopReason: partialStopReason,
    transcript: [],
    sharedContext: {
      sessionId: session.id,
      initialPrompt: "update two files",
      notes: [],
      handoffs: [],
    },
    finalOutput: "",
    codingResult,
  };
}

function makeThreeFilePlanningNoWriteResult(
  session: Session,
): OrchestrationResult {
  return buildMultiFileUpdatePlanningRouteResult({
    sessionId: session.id,
    prompt: "update three files with apply_patch",
    classification: makeThreeFilePlanningNoWriteClassification(),
  });
}

function makeThreeFilePlanningNoWriteClassification(): MultiFileUpdatePlanningClassification {
  return {
    capability: "multi-file-update-candidate-no-write",
    operation: "update",
    tier: "candidate",
    classificationMode: "synthetic-no-write",
    targetPaths: ["src/a.ts", "src/b.ts", "src/c.ts"],
    plannedFiles: ["src/a.ts", "src/b.ts", "src/c.ts"],
    wouldChangeFiles: ["src/a.ts", "src/b.ts", "src/c.ts"],
    blockedReason: "three-file-update-planning-no-write",
    expectedCapability:
      "selected-workspace exactly-three existing-file update planning/no-write",
    currentSupportedCapability:
      "exactly-three planning/no-write only; 3-file writes remain unsupported",
    drivesApplyPatchExpansion: false,
    willWrite: false,
    writerReachable: false,
    changedFiles: [],
    writeIntents: [],
    failedFiles: [],
    explanation: threeFileStopReason,
    nextAction: threeFileNextAction,
  };
}

function readState(
  manager: SessionManager,
  sessionId: string,
): {
  readonly workingMemory?: {
    readonly compacted?: boolean;
  };
} {
  const statePath = path.join(manager.getSessionDirPath(sessionId), "state.json");
  return JSON.parse(fs.readFileSync(statePath, "utf8")) as {
    readonly workingMemory?: {
      readonly compacted?: boolean;
    };
  };
}
