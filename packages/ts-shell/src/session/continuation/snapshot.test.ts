import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CodingResultSummary } from "../../result/types.js";
import { SessionManager } from "../SessionManager.js";
import type { Session } from "../schema/sessionRecord.js";
import type { SessionStateSnapshot } from "../schema/sessionStateSnapshot.js";
import type { TranscriptEvent } from "../sessionEventCodec.js";
import { buildSessionRecoverySnapshot } from "../recovery/sessionRecoverySnapshot.js";
import { buildSessionContinuitySnapshot } from "./sessionContinuitySnapshot.js";

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
    expect(reopened.getRecoverySnapshot(session.id).lastAssistantMessage?.content).toBe("abandoned answer");
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
});
