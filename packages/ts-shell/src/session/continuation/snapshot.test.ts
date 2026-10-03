import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CodingResultSummary } from "../../result/types.js";
import { SessionManager } from "../SessionManager.js";
import type { Session } from "../schema/sessionRecord.js";
import type { SessionStateSnapshot } from "../schema/sessionStateSnapshot.js";
import { buildLinearSessionThreadSnapshot } from "../schema/sessionThread.js";
import type { TranscriptEvent } from "../sessionEventCodec.js";
import { buildSessionRecoverySnapshot } from "../recovery/sessionRecoverySnapshot.js";
import { buildSessionContinuitySnapshot } from "./sessionContinuitySnapshot.js";
import { extractSeedInfluenceFromQueryResult } from "./sessionSeedInfluence.js";
import { projectSessionToolContinuity } from "./sessionToolContinuity.js";
import { projectSessionUnresolvedItems } from "./sessionUnresolvedItems.js";
import { resumeShellSession } from "../../core/shell/recovery.js";

const timestamp = "2026-10-03T00:00:00.000Z";

function fixture(result?: CodingResultSummary, memory?: unknown) {
  const session: Session = {
    id: "snapshot", projectRoot: "/workspace", status: "completed", createdAt: timestamp, updatedAt: timestamp,
    turns: [{ role: "user", content: "current request" }, { role: "assistant", content: "current answer" }],
  };
  const stateSnapshot: SessionStateSnapshot = { status: "completed", workingMemory: memory ?? {
    continuity: {
      lastActionHandoffSummary: "old action", lastFailureHandoffDiagnostic: "old failure",
      lastSuccessHandoffDiagnostic: "old success", lastSeedInfluence: "verify-signal",
      lastSeedInfluenceHandoffSummary: "old seed", lastWriterStarted: true,
      lastWriteEffect: "verified", lastWriteRequiresUserInspection: false, lastWriteEffectTarget: "old.txt",
    },
  } };
  const transcriptEvents: TranscriptEvent[] = result ? [{ type: "query-event", timestamp, event: {
    type: "query.completed", result: {
      status: "completed", terminalClassification: "success", terminalReason: "completed", transcript: [],
      sharedContext: { sessionId: session.id, initialPrompt: "current request", notes: [], handoffs: [] },
      finalOutput: "current answer", codingResult: result,
    },
  } }] : [];
  return {
    session, stateSnapshot, transcriptEvents, approvalHistoryLimit: 10,
    recoverySnapshot: buildSessionRecoverySnapshot({ sessionId: session.id, session, state: stateSnapshot, transcriptEvents }),
  };
}

function codingResult(failed = false): CodingResultSummary {
  return {
    taskKind: "edit-file", changedFiles: [], failedFiles: failed ? [{ path: "current.txt", reason: "current failure" }] : [],
    patches: [], evidence: [], verifiedFiles: failed ? [] : ["current.txt"], unverifiedFiles: [],
    repair: { status: "not-needed", attempts: 0, recoveredItems: [], failedItems: [], notes: [] },
    continuation: { status: "first-pass-success", attempts: 0, evidence: [] },
    verification: { status: failed ? "failed" : "passed", command: "check-current", reason: failed ? "current failure" : "current passed" },
    taskSatisfaction: { verdict: failed ? "insufficient-evidence" : "satisfied", requiredEvidence: [], observedEvidence: [], reasons: [] },
    changeSet: { attemptedFiles: ["current.txt"], changedFiles: [], preExistingDirtyFiles: [], postRunDirtyFiles: [], unchangedAttemptedFiles: [] },
  };
}

describe("session continuity snapshot sources", () => {
  it("excludes uncertain history whose source is not on the selected path", () => {
    const input = fixture({ ...codingResult(true), lastActionResultSeed: { actionKind: "edit-file", target: "discarded.ts",
      changedFiles: [], verifiedFiles: [], writerStarted: true, writeEffect: "unknown" } }, {});
    const event = input.transcriptEvents[0]!;
    input.transcriptEvents[0] = { ...event, sourceEntryId: "missing-source" } as TranscriptEvent;
    expect(buildSessionContinuitySnapshot(input).unresolvedItems.join("\n")).not.toContain("historical-write:");
  });

  it.each([0, 1, 2, 3])("uses the first valid seed source at priority %s", (priority) => {
    const sources = [0, 1, 2, 3].map(index => index < priority
      ? ["seedInfluence=invalid"] : [index === priority ? "seedInfluence=target-carryover" : "seedInfluence=verify-signal"]);
    const coding = codingResult();
    expect(extractSeedInfluenceFromQueryResult({
      status: "completed", terminalClassification: "success", terminalReason: "completed", transcript: [],
      finalOutput: "done", sharedContext: { sessionId: "test", initialPrompt: "request", notes: sources[0], handoffs: [] },
      codingResult: { ...coding, evidence: sources[1], continuation: { ...coding.continuation, evidence: sources[2] },
        repair: { ...coding.repair, notes: sources[3] } },
    })).toBe("target-carryover");
  });

  it("keeps the final tool provenance whole when optional fields are absent", () => {
    const projection = projectSessionToolContinuity({ ...codingResult(), provenance: { toolExecutions: [
      { kind: "executed-failed", source: "tool-result-metadata", toolName: "write", legacySuccess: false,
        taskId: "old-task", failureBoundary: "old-failure" },
      { kind: "executed-succeeded", source: "tool-result-metadata", toolName: "read", legacySuccess: true },
    ] } });
    expect(projection).toMatchObject({ lastToolExecutionProvenanceKind: "executed-succeeded", lastToolExecutionProvenanceToolName: "read" });
    expect(projection.lastToolExecutionProvenanceTaskId).toBeUndefined();
    expect(projection.lastToolExecutionFailureBoundary).toBeUndefined();
  });

  it.each([
    [" session failure ", " lifecycle failure ", "session failure"],
    ["  ", " lifecycle failure ", "lifecycle failure"],
    ["  ", "  ", "terminal reason"],
  ])("selects error precedence while retaining the separate stop reason (%s, %s)", (sessionLastError, detail, expected) => {
    const projection = projectSessionUnresolvedItems({ sessionLastError,
      lastRunErrorEvent: { type: "lifecycle", timestamp, event: "run-error", detail },
      continuityTerminalSource: { terminalClassification: "stopped", terminalReason: "stopped_error", stopReason: " terminal reason " },
    });
    expect(projection.lastFailure).toBe(expected);
    expect(projection.unresolvedItems).toEqual([
      `last-error:${expected}`, "terminal:stopped (stopped_error)", "stop-reason:terminal reason",
    ]);
  });

  it("does not fill absent current-result fields from an older checkpoint", () => {
    const snapshot = buildSessionContinuitySnapshot(fixture(codingResult()));
    expect(snapshot.lastSuccessHandoffDiagnostic).toContain("current.txt");
    expect(snapshot.lastFailureHandoffDiagnostic).toBeUndefined();
    expect(snapshot.lastActionHandoffSummary).toBeUndefined();
    expect(snapshot.lastSeedInfluence).toBeUndefined();
    expect(snapshot.lastSeedInfluenceHandoffSummary).toBeUndefined();
    expect(snapshot.lastWriterStarted).toBeUndefined();
    expect(snapshot.lastWriteEffect).toBeUndefined();
    expect(snapshot.lastWriteEffectTarget).toBeUndefined();
  });

  it("does not project historical verification success beside a current failure", () => {
    const snapshot = buildSessionContinuitySnapshot(fixture(codingResult(true)));
    expect(snapshot.lastFailureHandoffDiagnostic).toContain("current failure");
    expect(snapshot.lastSuccessHandoffDiagnostic).toBeUndefined();
  });

  it("retains legacy checkpoint fields when no structured result is available", () => {
    expect(buildSessionContinuitySnapshot(fixture())).toMatchObject({
      lastActionHandoffSummary: "old action", lastWriterStarted: true, lastWriteEffect: "verified",
      lastWriteEffectTarget: "old.txt", lastSeedInfluence: "verify-signal",
    });
  });

  it.each([undefined, "target-carryover"])("keeps seed influence with its coding completion (%s)", (influence) => {
    const result = codingResult();
    const input = fixture({ ...result,
      evidence: influence ? [`seedInfluence=${influence}`] : [],
      lastActionResultSeed: {
        actionKind: "edit-file", target: "current.txt", changedFiles: [], verifiedFiles: [],
        verification: { status: "passed" },
      },
    });
    const chat = fixture({ ...codingResult(), taskKind: "chat", evidence: ["seedInfluence=verify-signal"] });
    input.transcriptEvents.push(...chat.transcriptEvents);
    const snapshot = buildSessionContinuitySnapshot(input);
    expect(snapshot.lastTaskKind).toBe("edit-file");
    expect(snapshot.lastSeedInfluence).toBe(influence);
    expect(snapshot.lastSeedInfluenceHandoffSummary).toBe(influence
      ? "Seed influence: target-carryover from edit-file on current.txt."
      : undefined);
  });

  it("uses the retained coding checkpoint when the remaining transcript only has chat", () => {
    const input = fixture({ ...codingResult(), taskKind: "chat", evidence: ["seedInfluence=verify-signal"] }, {
      continuity: {
        lastTaskKind: "edit-file", lastTerminalClassification: "stopped", lastTerminalReason: "stopped_error",
        lastFailure: "retained coding failure", lastFailureHandoffDiagnostic: "retained failure handoff",
        lastWriterStarted: true, lastWriteEffect: "unknown", lastWriteRequiresUserInspection: true,
        lastWriteEffectTarget: "retained.txt", lastSeedInfluence: "target-carryover",
      },
    });
    const snapshot = buildSessionContinuitySnapshot(input);
    expect(snapshot).toMatchObject({
      lastTaskKind: "edit-file", lastTerminalClassification: "stopped", lastTerminalReason: "stopped_error",
      lastFailure: "retained coding failure", lastWriteEffect: "unknown", lastWriteEffectTarget: "retained.txt",
      lastSeedInfluence: "target-carryover", lastFailureHandoffDiagnostic: "retained failure handoff",
    });
    expect(snapshot.lastSuccessHandoffDiagnostic).toBeUndefined();
    expect(snapshot.lastVerificationStatus).toBeUndefined();
    expect(snapshot.recentVerifiedFiles).toEqual([]);
  });

  it.each([
    { continuity: { lastWriterStarted: true, lastWriteEffect: "unknown", lastWriteEffectTarget: "retained.txt" } },
    { summary: ["- last-writer-started: yes", "- last-write-effect: unknown", "- last-write-effect-target: retained.txt"] },
    { continuity: { lastTaskKind: "unsupported", lastTerminalClassification: "completed", lastTerminalReason: 42,
      lastWriterStarted: true, lastWriteEffect: "unknown", lastWriteEffectTarget: "retained.txt" } },
  ])("does not upgrade a legacy checkpoint with unknown terminal state using chat success (%j)", (memory) => {
    const snapshot = buildSessionContinuitySnapshot(fixture({ ...codingResult(), taskKind: "chat" }, memory));
    expect(snapshot.lastWriteEffect).toBe("unknown");
    expect(snapshot.lastTaskKind).toBeUndefined();
    expect(snapshot.lastTerminalClassification).toBeUndefined();
    expect(snapshot.lastTerminalReason).toBeUndefined();
    expect(snapshot.lastSuccessHandoffDiagnostic).toBeUndefined();
    expect(snapshot.lastVerificationStatus).toBeUndefined();
  });

  it("uses the current chat result when the stored checkpoint is also chat", () => {
    const snapshot = buildSessionContinuitySnapshot(fixture({ ...codingResult(), taskKind: "chat" }, {
      continuity: { lastTaskKind: "chat", lastTerminalClassification: "stopped", lastFailure: "previous chat failure" },
    }));
    expect(snapshot.lastTaskKind).toBe("chat");
    expect(snapshot.lastTerminalClassification).toBe("success");
    expect(snapshot.lastFailure).toBeUndefined();
    expect(snapshot.lastVerificationStatus).toBe("passed");
  });

  it("takes displayed messages from the selected session path", () => {
    const input = fixture();
    input.recoverySnapshot = { ...input.recoverySnapshot,
      lastUserMessage: { role: "user", content: "abandoned user" },
      lastAssistantMessage: { role: "assistant", content: "abandoned assistant" },
    };
    expect(buildSessionContinuitySnapshot(input)).toMatchObject({ lastUserIntent: "current request", lastAssistantOutput: "current answer" });
  });

  it("retains selected messages when no transcript message is available", () => {
    expect(buildSessionContinuitySnapshot(fixture())).toMatchObject({ lastUserIntent: "current request", lastAssistantOutput: "current answer" });
  });

  it.each(["completion", "failure"])("keeps a newer compact result ahead of an older %s", (kind) => {
    const input = fixture(codingResult(true), { continuity: { lastTaskKind: "edit-file", lastTerminalClassification: "success",
      lastSuccessHandoffDiagnostic: "newer checkpoint", resultSource: { eventId: "missing-new", entryId: "new" } } });
    input.session.turns = [{ id: "old", role: "assistant", content: "older" }, { id: "new", role: "assistant", content: "newer" }];
    input.stateSnapshot.thread = buildLinearSessionThreadSnapshot(input.session);
    const entry = input.transcriptEvents[0]!;
    if (entry.type !== "query-event") throw new Error("Expected query event");
    input.transcriptEvents = [{ ...entry, id: "old-event", sourceEntryId: "old", ...(kind === "failure"
      ? { event: { type: "query.failed" as const, error: "older failure" } } : {}) }];
    input.session.lastError = "older global error";
    input.recoverySnapshot = { ...input.recoverySnapshot, terminalClassification: "error", terminalReason: "stopped_error", stopReason: "older recovery error" };
    const snapshot = buildSessionContinuitySnapshot(input);
    expect(snapshot.lastSuccessHandoffDiagnostic).toBe("newer checkpoint");
    expect(snapshot.lastTerminalClassification).toBe("success");
    expect(snapshot.lastFailure).toBeUndefined();
    expect(snapshot.lastVerificationStatus).toBeUndefined();
  });

  it.each(["completion", "failure", "chat-error", "plain-stopped"])("reports unknown ordering for a compact checkpoint and %s at the same boundary", (kind) => {
    const input = fixture(codingResult(), { continuity: { lastTaskKind: "edit-file", lastTerminalClassification: "success",
      lastSuccessHandoffDiagnostic: "unordered checkpoint", resultSource: { eventId: "missing-event", entryId: "same" } } });
    input.session.turns = [{ id: "same", role: "assistant", content: "same boundary" }];
    input.stateSnapshot.thread = buildLinearSessionThreadSnapshot(input.session);
    const entry = input.transcriptEvents[0]!;
    if (entry.type !== "query-event") throw new Error("Expected query event");
    input.transcriptEvents = [{ ...entry, id: "surviving-event", sourceEntryId: "same", ...(kind === "failure"
      ? { event: { type: "query.failed" as const, error: "unordered failure" } } : {}) }];
    if (kind === "chat-error" && entry.event.type === "query.completed") input.transcriptEvents = [{ ...entry,
      id: "surviving-chat", sourceEntryId: "same", event: { ...entry.event, result: { ...entry.event.result,
        terminalClassification: "error", terminalReason: "stopped_error", codingResult: { ...codingResult(), taskKind: "chat" } } } }];
    if (kind === "plain-stopped" && entry.event.type === "query.completed") input.transcriptEvents = [{ ...entry,
      id: "surviving-plain", sourceEntryId: "same", event: { ...entry.event, result: { ...entry.event.result,
        terminalClassification: "stopped", terminalReason: "stopped_not_proven", codingResult: undefined } } }];
    const snapshot = buildSessionContinuitySnapshot(input);
    expect(snapshot.lastSuccessHandoffDiagnostic).toBeUndefined();
    expect(snapshot.lastTerminalClassification).toBeUndefined();
    expect(snapshot.lastVerificationStatus).toBeUndefined();
    expect(snapshot.recentVerifiedFiles).toEqual([]);
    expect(snapshot.unresolvedItems).toContain("Continuity result order unavailable; inspect current files before relying on historical verification.");
  });

  it("uses a repaired pending prompt without inventing a current assistant answer", () => {
    const input = fixture();
    input.session.turns = [];
    input.recoverySnapshot = { ...input.recoverySnapshot,
      pendingPrompt: "repaired prompt",
      lastUserMessage: { role: "user", content: "unrelated raw user" },
      lastAssistantMessage: { role: "assistant", content: "abandoned assistant" },
      repairSummary: { ...input.recoverySnapshot.repairSummary, insertedPromptMessage: true },
    };
    expect(buildSessionContinuitySnapshot(input)).toMatchObject({ lastUserIntent: "repaired prompt" });
    expect(buildSessionContinuitySnapshot(input).lastAssistantOutput).toBeUndefined();
  });

  it.each(["branch", "compaction"])("does not treat a %s context note as a user request", (contextSummary) => {
    const input = fixture();
    input.session.turns.push({ role: "user", content: "historical note about abandoned.txt", metadata: { contextSummary } });
    expect(buildSessionContinuitySnapshot(input).lastUserIntent).toBe("current request");
    input.session.turns.splice(0, 2);
    expect(buildSessionContinuitySnapshot(input).lastUserIntent).toBeUndefined();
  });
});

describe("stored session continuity messages", () => {
  let home: string | undefined;
  afterEach(() => {
    vi.unstubAllEnvs();
    if (home) fs.rmSync(home, { recursive: true, force: true });
    home = undefined;
  });

  function createManager() {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "continuity-home-"));
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);
    return new SessionManager();
  }

  it("does not ask recovery to fix an already resolved known file failure", async () => {
    const manager = createManager();
    const session = manager.createNew();
    for (const failed of [true, false]) {
      manager.persistUserPromptBarrier(session.id, failed ? "edit current.txt" : "retry current.txt");
      manager.addTurn(session.id, { role: "assistant", content: failed ? "failed" : "verified" });
      const envelope = fixture({ ...codingResult(failed), changedFiles: failed ? [] : ["current.txt"] }).transcriptEvents[0]!;
      if (envelope.type !== "query-event" || envelope.event.type !== "query.completed") throw new Error("Expected completion");
      manager.appendQueryEvent(session.id, { type: "query.completed", result: { ...envelope.event.result,
        status: failed ? "stopped_error" : "completed", terminalClassification: failed ? "error" : "success",
        terminalReason: failed ? "stopped_error" : "completed" } });
      if (failed) manager.saveError(session.id, "current failure");
      else manager.saveCompleted(session.id);
    }
    manager.persistUserPromptBarrier(session.id, "continue the task");
    manager.saveInterrupted(session.id, "prompt");
    const reopened = new SessionManager();
    expect(reopened.buildContinuitySnapshot(session.id).recentFailedFiles).toEqual([]);
    const resumed = await resumeShellSession({ requestedSessionId: session.id, sessionManager: reopened,
      runtimeContext: { projectRoot: session.projectRoot, session: { id: "other" },
        activeSession: { sessionId: "other" }, runtimeConfig: { maxTurns: 6 } } as never,
      renderer: { renderLine() {} } as never,
    });
    expect(resumed.resumed && resumed.autoResume).toBeTruthy();
    if (!resumed.resumed || !resumed.autoResume) throw new Error("Expected pending recovery");
    expect(resumed.autoResume.prompt).toContain("verified-files: current.txt");
    expect(resumed.autoResume.prompt).not.toContain("failed-files:");
    expect(resumed.autoResume.prompt).not.toContain("fixing the failed file operation");
  });

  it("uses structured handoff facts after persistence and reopening", () => {
    const manager = createManager();
    const session = manager.createNew();
    const input = fixture(codingResult());
    const completion = input.transcriptEvents[0]!;
    if (completion.type !== "query-event") throw new Error("Expected query completion fixture");
    manager.appendQueryEvent(session.id, completion.event);
    const statePath = path.join(manager.getSessionDirPath(session.id), "state.json");
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    state.workingMemory = input.stateSnapshot.workingMemory;
    fs.writeFileSync(statePath, JSON.stringify(state));
    const snapshot = new SessionManager().buildContinuitySnapshot(session.id);
    expect(snapshot.lastTaskKind).toBe("edit-file");
    expect(snapshot.lastSuccessHandoffDiagnostic).toContain("current.txt");
    expect(snapshot.lastFailureHandoffDiagnostic).toBeUndefined();
    expect(snapshot.lastWriteEffect).toBeUndefined();
    expect(snapshot.lastActionHandoffSummary).toBeUndefined();
  });

  it.each([undefined, "historical note about abandoned.txt"])("displays the selected branch after reopening (summary=%s)", async (summary) => {
    const manager = createManager();
    const session = manager.createNew();
    for (const content of ["selected request", "selected answer", "abandoned request", "abandoned answer"]) {
      manager.addTurn(session.id, { role: content.endsWith("request") ? "user" : "assistant", content });
    }
    const selectedAnswer = manager.getSession(session.id)!.turns[1]!.id!;
    expect(await manager.revertTo(session.id, selectedAnswer, summary ? async () => summary : undefined)).toBe(2);
    const reopened = new SessionManager();
    expect(reopened.getRecoverySnapshot(session.id).lastAssistantMessage?.content).toBe("selected answer");
    expect(reopened.buildContinuitySnapshot(session.id)).toMatchObject({
      lastUserIntent: "selected request", lastAssistantOutput: "selected answer",
    });
    expect(reopened.buildPromptContinuityContext(session.id, "continue from the previous task"))
      .not.toContain("abandoned answer");
  });

  it("includes a pending prompt missing from an interrupted turn transcript", () => {
    const manager = createManager();
    const session = manager.createNew();
    manager.markRunStarted(session.id, "pending request");
    manager.markTurnActive(session.id);
    manager.saveInterrupted(session.id, "turn");
    const reopened = new SessionManager();
    expect(reopened.getRecoverySnapshot(session.id).repairSummary.insertedPromptMessage).toBe(true);
    const snapshot = reopened.buildContinuitySnapshot(session.id);
    expect(snapshot.lastUserIntent).toBe("pending request");
    expect(snapshot.lastAssistantOutput).toBeUndefined();
  });

  it("keeps result facts on the selected branch after reverting and reopening", async () => {
    const manager = createManager();
    const session = manager.createNew();
    let selectedAnswer: string | undefined;
    for (const branch of ["selected", "abandoned"]) {
      manager.addTurn(session.id, { role: "user", content: `${branch} request` });
      manager.appendQueryEvent(session.id, { type: "query.started", sessionId: session.id, prompt: `${branch} request` });
      manager.addTurn(session.id, { role: "assistant", content: `${branch} answer` });
      const completion = fixture({ ...codingResult(), verifiedFiles: [`${branch}.txt`] }).transcriptEvents[0]!;
      if (completion.type !== "query-event") throw new Error("Expected completion");
      manager.appendQueryEvent(session.id, completion.event);
      if (branch === "selected") selectedAnswer = manager.getSession(session.id)!.turns.at(-1)!.id!;
    }
    expect(await manager.revertTo(session.id, selectedAnswer!)).toBe(2);
    const snapshot = new SessionManager().buildContinuitySnapshot(session.id);
    expect(snapshot.lastAssistantOutput).toBe("selected answer");
    expect(snapshot.recentVerifiedFiles).toEqual(["selected.txt"]);
    expect(snapshot.lastSuccessHandoffDiagnostic).toContain("selected.txt");
    expect(JSON.stringify(snapshot)).not.toContain("abandoned.txt");
  });

  function complete(manager: SessionManager, sessionId: string, result = codingResult()) {
    const envelope = fixture(result).transcriptEvents[0]!;
    if (envelope.type !== "query-event") throw new Error("Expected completion");
    manager.appendQueryEvent(sessionId, envelope.event);
  }

  function updateMemory(manager: SessionManager, sessionId: string, workingMemory: unknown) {
    const statePath = path.join(manager.getSessionDirPath(sessionId), "state.json");
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    fs.writeFileSync(statePath, JSON.stringify({ ...state, workingMemory }));
  }

  it("excludes an answer's result when rewinding to its initiating prompt", async () => {
    const manager = createManager();
    const session = manager.createNew();
    manager.addTurn(session.id, { role: "user", content: "original request" });
    const promptId = manager.getSession(session.id)!.turns.at(-1)!.id!;
    manager.addTurn(session.id, { role: "assistant", content: "discarded answer" });
    complete(manager, session.id);
    await manager.revertTo(session.id, promptId);
    const snapshot = new SessionManager().buildContinuitySnapshot(session.id);
    expect(snapshot.lastUserIntent).toBe("original request");
    expect(snapshot.lastTaskKind).toBeUndefined();
    expect(snapshot.lastVerificationStatus).toBeUndefined();
    expect(snapshot.lastTerminalClassification).toBeUndefined();
    expect(snapshot.recentVerifiedFiles).toEqual([]);
  });

  it("does not revive abandoned errors, pending prompts, approval or text memory", async () => {
    const manager = createManager();
    const session = manager.createNew();
    manager.addTurn(session.id, { role: "user", content: "selected request" });
    manager.addTurn(session.id, { role: "assistant", content: "selected answer" });
    const selectedId = manager.getSession(session.id)!.turns.at(-1)!.id!;
    manager.addTurn(session.id, { role: "user", content: "abandoned request" });
    manager.markRunStarted(session.id, "abandoned pending");
    manager.appendQueryEvent(session.id, { type: "query.failed", error: "abandoned failure" });
    manager.saveError(session.id, "abandoned global failure");
    updateMemory(manager, session.id, {
      summary: ["- last-action-handoff-summary: abandoned action", "- last-seed-influence: verify-signal"],
      continuity: { lastTaskKind: "edit-file", lastRequestScopeLabel: "abandoned scope", lastRequestScopeCacheKey: "abandoned cache",
        lastApprovalDecision: "allow", lastApprovalScope: "abandoned approval", lastApprovalProjectRoot: session.projectRoot,
        lastApprovalCacheKey: "abandoned cache", lastApprovalDecisionSource: "user", lastApprovalPersistent: true,
        lastWriteEffect: "verified", lastSuccessHandoffDiagnostic: "abandoned success" },
    });
    await manager.revertTo(session.id, selectedId);
    const snapshot = new SessionManager().buildContinuitySnapshot(session.id);
    expect(snapshot.lastUserIntent).toBe("selected request");
    expect(snapshot.lastFailure).toBeUndefined();
    expect(snapshot.lastTerminalClassification).toBeUndefined();
    expect(snapshot.lastActionHandoffSummary).toBeUndefined();
    expect(snapshot.lastSeedInfluence).toBeUndefined();
    expect(snapshot.lastApprovalHistory).toEqual([]);
    expect(JSON.stringify(snapshot)).not.toContain("abandoned");
  });

  it("preserves selected query errors after reopening a branch", async () => {
    const manager = createManager();
    const session = manager.createNew();
    manager.addTurn(session.id, { role: "user", content: "selected request" });
    const selectedId = manager.getSession(session.id)!.turns.at(-1)!.id!;
    manager.appendQueryEvent(session.id, { type: "query.failed", error: "selected failure" });
    manager.addTurn(session.id, { role: "user", content: "abandoned request" });
    complete(manager, session.id);
    await manager.revertTo(session.id, selectedId);
    expect(new SessionManager().buildContinuitySnapshot(session.id)).toMatchObject({
      lastFailure: "selected failure", lastTerminalClassification: "error", lastTerminalReason: "stopped_error",
    });
  });

  it("does not restore an explicitly unattributed failure through linear state or lifecycle fallbacks", () => {
    const manager = createManager();
    const session = manager.createNew();
    manager.addTurn(session.id, { role: "user", content: "request" });
    manager.appendQueryEvent(session.id, { type: "query.failed", error: "unattributed error" }, {});
    manager.saveError(session.id, "unattributed error");
    const snapshot = new SessionManager().buildContinuitySnapshot(session.id);
    expect(snapshot.lastFailure).toBeUndefined();
    expect(snapshot.lastTerminalClassification).toBeUndefined();
    expect(JSON.stringify(snapshot)).not.toContain("unattributed error");
  });

  it("retains a selected compact source through chat and excludes it after rewinding", async () => {
    const manager = createManager();
    const session = manager.createNew();
    manager.addTurn(session.id, { role: "user", content: "coding request" });
    const promptId = manager.getSession(session.id)!.turns.at(-1)!.id!;
    manager.addTurn(session.id, { role: "assistant", content: "coding answer" });
    const answerId = manager.getSession(session.id)!.turns.at(-1)!.id!;
    updateMemory(manager, session.id, { sourceTurnCount: 11 });
    complete(manager, session.id);
    const statePath = path.join(manager.getSessionDirPath(session.id), "state.json");
    const source = JSON.parse(fs.readFileSync(statePath, "utf8")).workingMemory.continuity.resultSource;
    expect(source).toMatchObject({ entryId: answerId });
    manager.addTurn(session.id, { role: "user", content: "hello" });
    manager.addTurn(session.id, { role: "assistant", content: "hi" });
    complete(manager, session.id, { ...codingResult(), taskKind: "chat", verifiedFiles: [] });
    manager.appendQueryEvent(session.id, { type: "query.started", sessionId: session.id, prompt: "another" });
    expect(JSON.parse(fs.readFileSync(statePath, "utf8")).workingMemory.continuity.resultSource).toEqual(source);
    const transcriptPath = path.join(manager.getSessionDirPath(session.id), "transcript.jsonl");
    const lines = fs.readFileSync(transcriptPath, "utf8").split("\n").filter(line => !line.includes(source.eventId));
    fs.writeFileSync(transcriptPath, lines.join("\n"));
    await manager.revertTo(session.id, answerId);
    expect(new SessionManager().buildContinuitySnapshot(session.id).lastSuccessHandoffDiagnostic).toContain("current.txt");
    await manager.revertTo(session.id, promptId);
    expect(new SessionManager().buildContinuitySnapshot(session.id).lastSuccessHandoffDiagnostic).toBeUndefined();
  });

  it("admits a selected chat checkpoint before applying non-chat preservation", async () => {
    const manager = createManager();
    const session = manager.createNew();
    manager.addTurn(session.id, { role: "user", content: "fork here" });
    const promptId = manager.getSession(session.id)!.turns.at(-1)!.id!;
    manager.addTurn(session.id, { role: "assistant", content: "abandoned code" });
    updateMemory(manager, session.id, { sourceTurnCount: 11 });
    complete(manager, session.id);
    const abandonedId = manager.getSession(session.id)!.turns.at(-1)!.id!;
    await manager.revertTo(session.id, promptId);
    manager.addTurn(session.id, { role: "assistant", content: "selected chat" });
    const selectedId = manager.getSession(session.id)!.turns.at(-1)!.id!;
    complete(manager, session.id, { ...codingResult(), taskKind: "chat", verifiedFiles: [] });
    const statePath = path.join(manager.getSessionDirPath(session.id), "state.json");
    const checkpoint = JSON.parse(fs.readFileSync(statePath, "utf8")).workingMemory.continuity;
    expect(checkpoint).toMatchObject({ lastTaskKind: "chat", resultSource: { entryId: selectedId } });
    const late = fixture(codingResult()).transcriptEvents[0]!;
    if (late.type !== "query-event") throw new Error("Expected completion");
    manager.appendQueryEvent(session.id, late.event, { entryId: abandonedId });
    expect(JSON.parse(fs.readFileSync(statePath, "utf8")).workingMemory.continuity).toEqual(checkpoint);
    manager.appendQueryEvent(session.id, late.event, {});
    expect(JSON.parse(fs.readFileSync(statePath, "utf8")).workingMemory.continuity).toEqual(checkpoint);
    expect(new SessionManager().buildContinuitySnapshot(session.id).lastTaskKind).toBe("chat");
  });
});
