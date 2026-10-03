import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { CodingResultSummary, OrchestrationResult } from "../../result/types.js";
import { applyAutoCompactRetention } from "../agent/compaction.js";
import { SessionManager } from "../SessionManager.js";

function completion(failed: boolean, taskKind: CodingResultSummary["taskKind"] = "edit-file"): OrchestrationResult {
  return {
    status: failed ? "stopped_error" : "completed",
    terminalClassification: failed ? "stopped" : "success",
    terminalReason: failed ? "stopped_error" : "completed",
    ...(failed ? { stopReason: "current failure" } : {}),
    transcript: [], sharedContext: { sessionId: "retention", initialPrompt: "work", notes: [], handoffs: [] },
    finalOutput: failed ? "current failure" : "current success",
    codingResult: {
      taskKind, changedFiles: [], failedFiles: failed ? [{ path: "failed.txt", reason: "current failure" }] : [],
      patches: [], evidence: [], verifiedFiles: failed ? [] : ["verified.txt"], unverifiedFiles: [],
      repair: { status: "not-needed", attempts: 0, recoveredItems: [], failedItems: [], notes: [] },
      continuation: { status: "first-pass-success", attempts: 0, evidence: [] },
      verification: { status: failed ? "failed" : "passed", reason: failed ? "current failure" : "current success" },
      taskSatisfaction: { verdict: failed ? "insufficient-evidence" : "satisfied", requiredEvidence: [], observedEvidence: [], reasons: [] },
      changeSet: { gitAware: false, attemptedFiles: [], changedFiles: [], preExistingDirtyFiles: [], postRunDirtyFiles: [], unchangedAttemptedFiles: [] },
      ...(failed ? { lastActionResultSeed: {
        actionKind: "edit-file" as const, target: "failed.txt", changedFiles: [], verifiedFiles: [],
        writerStarted: true, writeEffect: "unknown" as const, requiresUserInspection: true,
        verification: { status: "failed" as const, reason: "current failure" },
      } } : {}),
    },
  };
}

function retain(workingMemory: unknown, result: OrchestrationResult, now = "2026-10-03T00:00:00.000Z") {
  return applyAutoCompactRetention(workingMemory, { type: "query.completed", result }, { turnThreshold: 1, now }) as {
    continuity: Record<string, unknown>; summary: string[]; sourceTurnCount: number; compactedAt: string;
  };
}

describe("compact result replacement", () => {
  it.each([
    { writeEffect: "unknown", sameTarget: false }, { writeEffect: "unverified", sameTarget: false },
    { writeEffect: "unknown", sameTarget: true }, { writeEffect: "unverified", sameTarget: true },
  ] as const)("keeps historical $writeEffect records after checkpoint replacement (sameTarget=$sameTarget)", async ({ writeEffect, sameTarget }) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "inspection-retention-"));
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);
    try {
      const manager = new SessionManager();
      const session = manager.createNew();
      let promptId = "";
      for (let turn = 0; turn < 12; turn++) {
        manager.persistUserPromptBarrier(session.id, `work ${turn}`);
        if (turn === 0) promptId = manager.getSession(session.id)!.turns.at(-1)!.id!;
        manager.addTurn(session.id, { role: "assistant", content: `answer ${turn}` });
        const base = completion(turn === 0);
        const result = turn === 0 ? { ...base, codingResult: { ...base.codingResult!,
          lastActionResultSeed: { ...base.codingResult!.lastActionResultSeed!, writeEffect } } }
          : sameTarget ? { ...base, codingResult: { ...base.codingResult!, changedFiles: ["failed.txt"], verifiedFiles: ["failed.txt"],
            changeSet: { ...base.codingResult!.changeSet, attemptedFiles: ["failed.txt"], changedFiles: ["failed.txt"] } } } : base;
        manager.appendQueryEvent(session.id, { type: "query.completed", result });
        if (turn === 0) manager.saveError(session.id, "current failure");
        else manager.saveCompleted(session.id);
      }
      const answerId = manager.getSession(session.id)!.turns.at(-1)!.id!;
      const original = manager.getTranscriptEvents(session.id).find(event => event.type === "query-event" &&
        event.event.type === "query.completed" && event.event.result.codingResult?.lastActionResultSeed?.writeEffect === writeEffect)!;
      const state = JSON.parse(fs.readFileSync(path.join(manager.getSessionDirPath(session.id), "state.json"), "utf8"));
      expect(state.workingMemory).toMatchObject({ sourceTurnCount: 12, compacted: true });
      expect(state.workingMemory.continuity.lastWriteEffect).toBeUndefined();
      const reopened = new SessionManager();
      const snapshot = reopened.buildContinuitySnapshot(session.id);
      expect(snapshot.lastTerminalClassification).toBe("success");
      expect(snapshot.lastVerificationStatus).toBe("passed");
      expect(snapshot.lastWriteEffect).toBeUndefined();
      expect(snapshot.lastFailureHandoffDiagnostic).toBeUndefined();
      expect(snapshot.unresolvedItems.join("\n")).toContain(`historical-write: ${writeEffect}`);
      expect(snapshot.unresolvedItems.join("\n")).toContain("failed.txt");
      expect(snapshot.unresolvedItems.join("\n")).toContain(original.id);
      expect(reopened.buildPromptContinuityContext(session.id, "next")).toContain(`historical-write: ${writeEffect}`);
      reopened.appendCompactionEntry(session.id, { summary: "Earlier conversation compacted", firstKeptEntryId: answerId, keptMessages: 1 });
      const compacted = new SessionManager();
      expect(compacted.getSession(session.id)!.turns.some(turn => turn.content === "answer 0")).toBe(false);
      expect(compacted.getTranscriptEvents(session.id).some(event => event.id === original.id)).toBe(true);
      expect(compacted.buildContinuitySnapshot(session.id).unresolvedItems.join("\n")).toContain(`historical-write: ${writeEffect}`);
      await reopened.revertTo(session.id, promptId);
      expect(new SessionManager().buildContinuitySnapshot(session.id).unresolvedItems.join("\n")).not.toContain("historical-write:");
      await reopened.revertTo(session.id, answerId);
      expect(new SessionManager().buildContinuitySnapshot(session.id).unresolvedItems.join("\n")).toContain(`historical-write: ${writeEffect}`);
    } finally {
      vi.unstubAllEnvs();
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("refreshes a completed checkpoint and clears obsolete optional failure and write facts", () => {
    const first = retain({ summary: ["- custom: retain"] }, completion(true));
    const next = retain(first, completion(false), "2026-10-03T00:01:00.000Z");
    expect(next.continuity.lastSuccessHandoffDiagnostic).toContain("verified.txt");
    expect(next.continuity.lastFailureHandoffDiagnostic).toBeUndefined();
    expect(next.continuity.lastActionHandoffSummary).toBeUndefined();
    expect(next.continuity.lastWriteEffect).toBeUndefined();
    expect(next.continuity.lastWriteEffectTarget).toBeUndefined();
    expect(next.continuity.lastTerminalClassification).toBe("success");
    expect(next.continuity.lastTerminalReason).toBe("completed");
    expect(next.continuity.lastFailure).toBeUndefined();
    expect(next.summary.join("\n")).not.toContain("failed.txt");
    expect(next.summary).toContain("- custom: retain");
    expect(next.sourceTurnCount).toBe(2);
    expect(next.compactedAt).toBe("2026-10-03T00:01:00.000Z");
    expect(first.continuity.lastWriteEffect).toBe("unknown");
  });

  it("replaces old success with the next failure without mutating the earlier checkpoint", () => {
    const first = retain({}, completion(false));
    const next = retain(first, completion(true));
    expect(next.continuity.lastFailureHandoffDiagnostic).toContain("current failure");
    expect(next.continuity.lastSuccessHandoffDiagnostic).toBeUndefined();
    expect(next.continuity.lastWriteEffect).toBe("unknown");
    expect(first.continuity.lastSuccessHandoffDiagnostic).toContain("verified.txt");
  });

  it.each([true, false])("keeps an unresolved coding checkpoint across later chat or unstructured completion (%s)", (chat) => {
    const first = retain({}, completion(true));
    const result = completion(false, "chat");
    const next = retain(first, chat ? result : { ...result, codingResult: undefined });
    expect(next.continuity).toEqual(first.continuity);
    expect(next.summary).toEqual(first.summary);
    expect(next.sourceTurnCount).toBe(2);
  });

  it("replaces stale optional fields in a legacy checkpoint on the first threshold update", () => {
    const next = retain({
      continuity: { lastSuccessHandoffDiagnostic: "old success", lastSeedInfluence: "verify-signal", lastSeedInfluenceHandoffSummary: "old seed", custom: "retain" },
      summary: ["- last-success-handoff-diagnostic: old success", "- last-seed-influence: verify-signal"],
    }, completion(true));
    expect(next.continuity.lastSuccessHandoffDiagnostic).toBeUndefined();
    expect(next.continuity.lastSeedInfluence).toBeUndefined();
    expect(next.continuity.lastSeedInfluenceHandoffSummary).toBeUndefined();
    expect(next.continuity.custom).toBe("retain");
    expect(next.summary.join("\n")).not.toContain("old success");
    expect(next.summary.join("\n")).not.toContain("verify-signal");
  });

  it("accepts a structured result after an earlier completion without one", () => {
    const result = completion(false);
    const first = retain({}, { ...result, codingResult: undefined });
    const next = retain(first, completion(true));
    expect(next.continuity.lastFailureHandoffDiagnostic).toContain("current failure");
    expect(next.continuity.lastWriteEffect).toBe("unknown");
  });

  it.each([true, false])("retains legacy result text without structured continuity (%s)", (chat) => {
    const summary = ["- last-writer-started: yes", "- last-write-effect: unknown", "- last-write-effect-target: legacy.txt"];
    const result = completion(false, "chat");
    const next = retain({ summary }, chat ? result : { ...result, codingResult: undefined });
    expect(next.summary).toEqual(summary);
    expect(next.continuity.lastSuccessHandoffDiagnostic).toBeUndefined();
  });

  it("updates chat checkpoints when no coding checkpoint preceded them", () => {
    const first = retain({}, completion(true, "chat"));
    const next = retain(first, completion(false, "chat"));
    expect(next.continuity.lastSuccessHandoffDiagnostic).toContain("verified.txt");
    expect(next.continuity.lastFailureHandoffDiagnostic).toBeUndefined();
  });

  it("persists the refreshed checkpoint for legacy fallback after reopening", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "retention-home-"));
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);
    try {
      const manager = new SessionManager();
      const session = manager.createNew();
      const statePath = path.join(manager.getSessionDirPath(session.id), "state.json");
      const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
      state.workingMemory = { sourceTurnCount: 11, summary: [] };
      fs.writeFileSync(statePath, JSON.stringify(state));
      for (const failed of [true, false]) {
        const result = completion(failed);
        manager.appendQueryEvent(session.id, { type: "query.completed", result: {
          ...result, sharedContext: { ...result.sharedContext, sessionId: session.id },
        } });
      }
      expect(manager.getTranscriptEvents(session.id).filter((event) => event.type === "query-event")).toHaveLength(2);
      const persisted = JSON.parse(fs.readFileSync(statePath, "utf8")).workingMemory;
      expect(persisted.sourceTurnCount).toBe(13);
      expect(persisted.continuity.lastSuccessHandoffDiagnostic).toContain("verified.txt");
      expect(persisted.continuity.lastWriteEffect).toBeUndefined();
      // A legacy retained transcript may no longer carry the structured result.
      const transcriptPath = path.join(manager.getSessionDirPath(session.id), "transcript.jsonl");
      const header = fs.readFileSync(transcriptPath, "utf8").split("\n")[0];
      fs.writeFileSync(transcriptPath, `${header}\n`);
      const snapshot = new SessionManager().buildContinuitySnapshot(session.id);
      expect(snapshot.lastSuccessHandoffDiagnostic).toContain("verified.txt");
      expect(snapshot.lastFailureHandoffDiagnostic).toBeUndefined();
      expect(snapshot.lastWriteEffect).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("starts checkpoint retention in a fresh session without approval memory", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "fresh-retention-"));
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);
    try {
      const manager = new SessionManager();
      const session = manager.createNew();
      const statePath = path.join(manager.getSessionDirPath(session.id), "state.json");
      expect(JSON.parse(fs.readFileSync(statePath, "utf8")).workingMemory).toBeUndefined();
      for (let index = 0; index < 12; index++) {
        manager.persistUserPromptBarrier(session.id, `request ${index}`);
        manager.addTurn(session.id, { role: "assistant", content: `answer ${index}` });
        const result = completion(index === 11);
        manager.appendQueryEvent(session.id, { type: "query.completed", result });
        if (index === 11) manager.saveError(session.id, "current failure", {
          terminalClassification: result.terminalClassification, terminalReason: result.terminalReason,
        });
        else manager.saveCompleted(session.id);
      }
      const memory = JSON.parse(fs.readFileSync(statePath, "utf8")).workingMemory;
      expect(memory).toMatchObject({ sourceTurnCount: 12, compacted: true,
        continuity: { lastWriteEffect: "unknown" } });
      expect(memory.approvalAuditHistory).toBeUndefined();
      expect(new SessionManager().buildContinuitySnapshot(session.id).lastWriteEffect).toBe("unknown");
    } finally {
      vi.unstubAllEnvs();
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it.each([true, false])("reopens a retained coding checkpoint across a chat-only transcript (failed=%s)", (failed) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "retention-chat-home-"));
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);
    try {
      const manager = new SessionManager();
      const session = manager.createNew();
      const sessionDir = manager.getSessionDirPath(session.id);
      const statePath = path.join(sessionDir, "state.json");
      const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
      state.workingMemory = { sourceTurnCount: 11, summary: [] };
      fs.writeFileSync(statePath, JSON.stringify(state));
      manager.appendQueryEvent(session.id, { type: "query.completed", result: completion(failed) });
      const stored = JSON.parse(fs.readFileSync(statePath, "utf8")).workingMemory.continuity;
      const transcriptPath = path.join(sessionDir, "transcript.jsonl");
      const header = fs.readFileSync(transcriptPath, "utf8").split("\n")[0];
      fs.writeFileSync(transcriptPath, `${header}\n`);
      new SessionManager().appendQueryEvent(session.id, { type: "query.completed", result: completion(false, "chat") });
      expect(JSON.parse(fs.readFileSync(statePath, "utf8")).workingMemory.continuity).toEqual(stored);
      const reopened = new SessionManager();
      expect(reopened.getTranscriptEvents(session.id).filter((event) => event.type === "query-event")).toHaveLength(1);
      const snapshot = reopened.buildContinuitySnapshot(session.id);
      expect(snapshot.lastTaskKind).toBe("edit-file");
      expect(snapshot.lastTerminalClassification).toBe(failed ? "stopped" : "success");
      expect(snapshot.lastTerminalReason).toBe(failed ? "stopped_error" : "completed");
      expect(snapshot.lastFailure).toBe(failed ? "current failure" : undefined);
      expect(snapshot.lastWriteEffect).toBe(failed ? "unknown" : undefined);
      expect(snapshot.lastWriteRequiresUserInspection).toBe(failed ? true : undefined);
      expect(snapshot.lastSuccessHandoffDiagnostic).toBe(stored.lastSuccessHandoffDiagnostic);
      expect(snapshot.lastVerificationStatus).toBeUndefined();
      expect(snapshot.recentVerifiedFiles).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
