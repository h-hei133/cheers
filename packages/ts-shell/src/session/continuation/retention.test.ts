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
  it("refreshes a completed checkpoint and clears obsolete optional failure and write facts", () => {
    const first = retain({ summary: ["- custom: retain"] }, completion(true));
    const next = retain(first, completion(false), "2026-10-03T00:01:00.000Z");
    expect(next.continuity.lastSuccessHandoffDiagnostic).toContain("verified.txt");
    expect(next.continuity.lastFailureHandoffDiagnostic).toBeUndefined();
    expect(next.continuity.lastActionHandoffSummary).toBeUndefined();
    expect(next.continuity.lastWriteEffect).toBeUndefined();
    expect(next.continuity.lastWriteEffectTarget).toBeUndefined();
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
});
