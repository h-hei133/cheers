import { describe, expect, it } from "vitest";
import { createQueryRuntimeHarnessState } from "../../core/query/runtime/harness.js";
import { encodeSessionHarnessState } from "../harness/state.js";
import { buildLinearSessionThreadSnapshot } from "../schema/sessionThread.js";
import type { Session } from "../schema/sessionRecord.js";
import type { SessionStateSnapshot } from "../schema/sessionStateSnapshot.js";
import { createMessageTranscriptEvent, type TranscriptEvent } from "../sessionEventCodec.js";
import { buildSessionRecoverySnapshot } from "./sessionRecoverySnapshot.js";
import { buildResumeReplayInput } from "../replay/builder.js";

const timestamp = "2026-10-03T00:00:00.000Z";
function fixture() {
  const session: Session = { id: "scope", status: "interrupted", createdAt: timestamp, updatedAt: timestamp,
    pendingPrompt: "different metadata prompt", turns: [
      { id: "base", role: "user", content: "base request", timestamp },
      { id: "answer", role: "assistant", content: "base answer", timestamp },
      { id: "pending", role: "user", content: "selected request", timestamp },
    ] };
  const thread = buildLinearSessionThreadSnapshot(session);
  const state: SessionStateSnapshot = { status: "interrupted", pendingPrompt: "selected request",
    pendingPromptEntryId: "pending", runPhase: "turn-active", interruptedKind: "turn",
    thread: { ...thread, entries: [...thread.entries,
      { id: "discarded", kind: "turn-message", parentId: "answer", role: "user", order: 4 }],
    },
  };
  const transcriptEvents: TranscriptEvent[] = session.turns.map(turn => createMessageTranscriptEvent({ ...turn, timestamp }));
  transcriptEvents.push({ type: "branch_summary", timestamp, toEntryId: "pending", droppedTurns: 1 });
  return { sessionId: session.id, session, state, transcriptEvents };
}

describe("operational recovery provenance", () => {
  it("uses the prompt and source from the same durable state observation", () => {
    expect(buildSessionRecoverySnapshot(fixture()).pendingPrompt).toBe("selected request");
  });

  it("repairs a missing raw prompt supported by a selected durable user entry", () => {
    const input = fixture();
    input.transcriptEvents = input.transcriptEvents.filter(event => event.id !== "pending");
    const snapshot = buildSessionRecoverySnapshot(input);
    expect(snapshot.pendingPrompt).toBe("selected request");
    expect(snapshot.lastUserMessage?.content).toBe("selected request");
    expect(snapshot.repairSummary.insertedPromptMessage).toBe(true);
    expect(snapshot.repairSummary.insertedRunStarted).toBe(true);
  });

  it("resolves the pending boundary after removing empty assistant messages", () => {
    const input = fixture();
    input.transcriptEvents.splice(1, 0, createMessageTranscriptEvent({ id: "empty", role: "assistant", content: "", timestamp }));
    input.state.thread = { ...input.state.thread!, entries: input.state.thread!.entries.map(entry =>
      entry.id === "answer" ? { ...entry, parentId: "empty" } : entry).concat({
      id: "empty", parentId: "base", kind: "turn-message", role: "assistant", order: 1,
    }) };
    const snapshot = buildSessionRecoverySnapshot(input);
    expect(snapshot.repairSummary.insertedPromptMessage).toBe(false);
    expect(snapshot.transcriptEvents.filter(event => event.type === "message" && event.role === "user")).toHaveLength(2);
  });

  it.each([true, false])("excludes old open work when fresh prompt marker is missing (message retained=%s)", retained => {
    const input = fixture();
    input.state.runPhase = "prompt-persisted";
    input.transcriptEvents.splice(2, 0,
      { type: "query-event", sourceEntryId: "answer", timestamp, event: { type: "turn.started", role: "coder", turn: 1 } },
      { type: "query-event", sourceEntryId: "answer", timestamp, event: { type: "tool.started", taskId: "old-open", toolName: "write" } },
    );
    if (!retained) input.transcriptEvents = input.transcriptEvents.filter(event => event.id !== "pending");
    const snapshot = buildSessionRecoverySnapshot(input);
    expect(snapshot.pendingLifecycle.pendingTools).toEqual({});
    expect(snapshot.repairSummary.insertedRunStarted).toBe(true);
    const seed = buildResumeReplayInput({ sessionId: input.sessionId, snapshot });
    expect(seed.truthBoundary.openTurn).toBeUndefined();
    expect(seed.truthBoundary.pairedTurnCount).toBe(0);
  });

  it.each([undefined, "", "missing", "discarded", "answer", "scope:root", 42, null])("rejects invalid pending source %s", source => {
    const input = fixture();
    input.state.pendingPromptEntryId = source as string | undefined;
    const snapshot = buildSessionRecoverySnapshot(input);
    expect(snapshot.pendingPrompt).toBeUndefined();
    expect(snapshot.runPhase).toBeUndefined();
    expect(snapshot.interruptedKind).toBeUndefined();
    expect(snapshot.repairSummary.insertedRunInterrupted).toBe(false);
  });

  it.each(["mismatched text", "duplicate message", "wrong role"])("rejects %s for a selected prompt stamp", kind => {
    const input = fixture();
    const index = input.transcriptEvents.findIndex(event => event.id === "pending");
    if (kind === "duplicate message") input.transcriptEvents.push(input.transcriptEvents[index]!);
    else input.transcriptEvents[index] = createMessageTranscriptEvent({ id: "pending", timestamp,
      role: kind === "wrong role" ? "assistant" : "user", content: kind === "mismatched text" ? "other" : "selected request" });
    expect(buildSessionRecoverySnapshot(input).pendingPrompt).toBeUndefined();
  });

  it("does not authenticate an old harness with a fresh pending prompt", () => {
    const input = fixture();
    const harness = encodeSessionHarnessState(createQueryRuntimeHarnessState({
      pendingVerification: [{ queueId: "discarded", targetFiles: ["discarded.ts"] }],
    }));
    input.state.harness = harness;
    input.state.workingMemory = { continuity: { harnessState: harness } };
    const snapshot = buildSessionRecoverySnapshot(input);
    expect(snapshot.pendingPrompt).toBe("selected request");
    expect(snapshot.harness).toBeUndefined();
  });

  it("rejects an ancestor prompt stamp superseded by a newer selected user message", () => {
    const input = fixture();
    input.state.pendingPromptEntryId = "base";
    input.state.pendingPrompt = "base request";
    expect(buildSessionRecoverySnapshot(input).pendingPrompt).toBeUndefined();
  });

  it("does not expose a previous selected terminal as the fresh pending run", () => {
    const input = fixture();
    input.state.lastError = "discarded state error";
    input.state.durableStatus = "success";
    input.state.terminalClassification = "success";
    input.transcriptEvents.splice(2, 0, { type: "query-event", sourceEntryId: "answer", timestamp,
      event: { type: "query.failed", error: "previous selected error" } });
    const snapshot = buildSessionRecoverySnapshot(input);
    expect(snapshot.terminalClassification).toBeUndefined();
    expect(snapshot.durableStatus).toBeUndefined();
    expect(snapshot.lastError).toBeUndefined();
  });

  it("retains selected terminal events when only the discarded branch was interrupted", () => {
    const input = fixture();
    input.state.pendingPromptEntryId = "discarded";
    input.transcriptEvents.push({ type: "query-event", sourceEntryId: "pending", timestamp,
      event: { type: "query.failed", error: "selected failure" } });
    const snapshot = buildSessionRecoverySnapshot(input);
    expect(snapshot.lastError).toBe("selected failure");
    expect(snapshot.terminalClassification).toBe("error");
    expect(snapshot.repairSummary.strippedInterruptedTerminalEvents).toBe(0);
  });

  it("does not settle a selected tool with a discarded resolution sharing its task id", () => {
    const input = fixture();
    input.transcriptEvents.push(
      { type: "query-event", sourceEntryId: "pending", timestamp,
        event: { type: "tool.started", toolName: "write", taskId: "reused" } },
      { type: "query-event", sourceEntryId: "discarded", timestamp,
        event: { type: "tool.result", toolName: "write", taskId: "reused", output: "discarded success" } },
    );
    const snapshot = buildSessionRecoverySnapshot(input);
    expect(snapshot.pendingLifecycle.pendingTools).toHaveProperty("reused");
    expect(JSON.stringify(snapshot.transcriptEvents)).not.toContain("discarded success");
  });
});
