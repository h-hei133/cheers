import { describe, expect, it } from "vitest";
import type { SessionThreadSnapshot } from "../schema/sessionThread.js";
import type { TranscriptEvent } from "../sessionEventCodec.js";
import { continuityBranchScope, selectBranchResultMemory } from "./branch.js";

const thread: SessionThreadSnapshot = {
  schemaVersion: 1, activeLeafId: "selected", branches: [], compactions: [],
  entries: [
    { id: "root", kind: "session-root", order: 0 },
    { id: "selected", parentId: "root", kind: "turn-message", role: "assistant", order: 1 },
    { id: "abandoned", parentId: "selected", kind: "turn-message", role: "assistant", order: 2 },
  ],
};

describe("continuity branch admission", () => {
  it.each([undefined, null, {}, { eventId: "completion" }, { eventId: "completion", entryId: "" },
    { eventId: "completion", entryId: "abandoned" }, { eventId: "completion", entryId: "missing" }])(
    "excludes unknown, malformed and off-path compact provenance (%j)", (resultSource) => {
      const memory = { other: "preserved", continuity: { resultSource, lastTaskKind: "edit-file",
        lastWriteEffect: "verified", lastApprovalDecision: "allow" },
      summary: ["ordinary note", "- last-action-handoff-summary: discarded", "- last-write-effect: verified"] };
      expect(selectBranchResultMemory(memory, thread, [])).toEqual({
        other: "preserved", continuity: { lastApprovalDecision: "allow" }, summary: ["ordinary note"],
      });
      expect(memory.continuity.lastWriteEffect).toBe("verified");
    },
  );

  it("admits a compact-only source on the canonical selected path", () => {
    const memory = { continuity: { resultSource: { eventId: "completion", entryId: "selected" }, lastWriteEffect: "unknown" } };
    expect(selectBranchResultMemory(memory, thread, [])).toBe(memory);
    const contradictory = [{ type: "query-event", id: "completion", sourceEntryId: "abandoned", timestamp: "now",
      event: { type: "query.failed", error: "other branch" } }] as const;
    expect(selectBranchResultMemory(memory, thread, contradictory)).toEqual({ continuity: {}, summary: undefined });
  });

  it("does not admit legacy facts through a thread that misses transcript messages", () => {
    const linear = { ...thread, entries: thread.entries.slice(0, 2) };
    const uncovered: TranscriptEvent = { type: "message", id: "uncovered", role: "assistant", content: "discarded", timestamp: "now" };
    expect(continuityBranchScope(linear, []).allowLegacy).toBe(true);
    expect(continuityBranchScope(linear, [uncovered]).allowLegacy).toBe(false);
    expect(continuityBranchScope({ ...linear, activeLeafId: "missing" }, []).admitsEntry("selected")).toBe(false);
    expect(continuityBranchScope(linear, []).admitsEntry(null)).toBe(false);
  });
});
