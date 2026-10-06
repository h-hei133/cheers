import { describe, expect, it, vi } from "vitest";
import { getSessionUsage, recordSessionUsage, totalTokens } from "../../observability/usageTelemetry.js";
import type { SessionMessage } from "../../session/schema/sessionMessage.js";
import type { CompactionPolicy, SummarizeRequest } from "../../session/compaction.js";
import { compactSessionHistory, type CompactionStore } from "./compaction.js";

function exchange(count: number, padding = 400): SessionMessage[] {
  const turns: SessionMessage[] = [];
  for (let i = 0; i < count; i++) {
    turns.push({ role: "user", content: `question ${i} ${"x".repeat(padding)}` });
    turns.push({ role: "assistant", content: `answer ${i} ${"y".repeat(padding)}` });
  }
  return turns;
}

/**
 * A window below what `exchange` costs, so the size threshold is crossed. The
 * manual path ignores that threshold anyway — `/compact` is the user asking —
 * but the numbers have to be real for the accounting to mean anything.
 */
const POLICY: CompactionPolicy = { contextWindow: 900, reserveTokens: 0, keepRecentTokens: 300 };

function store(turns: SessionMessage[]): CompactionStore & { entries: Array<{ summary: string; keptMessages: number }> } {
  const entries: Array<{ summary: string; keptMessages: number }> = [];
  return {
    entries,
    getSession: () => ({ turns }),
    appendCompactionEntry: (_id, input) => {
      entries.push({ summary: input.summary, keptMessages: input.keptMessages });
    },
  };
}

describe("session compaction", () => {
  it("condenses the older messages, keeps the tail, and forgets the stale context gauge", async () => {
    const turns = exchange(6);
    const target = store(turns);
    recordSessionUsage("sess_compact", { promptTokens: 9_000, completionTokens: 100 });
    const requests: SummarizeRequest[] = [];
    const outcome = await compactSessionHistory({
      store: target,
      sessionId: "sess_compact",
      policy: POLICY,
      summarize: async (request) => {
        requests.push(request);
        return "checkpoint summary";
      },
    });

    expect(outcome.status).toBe("compacted");
    if (outcome.status !== "compacted") throw new Error("unreachable");
    // Twelve messages in; the cut keeps the newest three, so nine go. The cut
    // lands inside the newest exchange, so eight of those nine are history and
    // the ninth is the opening of the split turn, summarized separately.
    expect(outcome.summarized).toBe(9);
    expect(outcome.kept).toBe(3);
    expect(outcome.tokensAfter).toBeLessThan(outcome.tokensBefore);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.messages).toHaveLength(8);
    expect(target.entries).toEqual([{ summary: "checkpoint summary", keptMessages: 3 }]);
    expect(getSessionUsage("sess_compact").lastPromptTokens).toBeUndefined();
    // Summed across the per-model buckets: the session total is derived, not stored.
    expect(totalTokens(getSessionUsage("sess_compact"))).toBe(9_100);
  });

  it("passes the user's focus instructions to the summarizer", async () => {
    const requests: SummarizeRequest[] = [];
    await compactSessionHistory({
      store: store(exchange(6)),
      sessionId: "s",
      policy: POLICY,
      instructions: "keep the migration plan",
      summarize: async (request) => {
        requests.push(request);
        return "checkpoint summary";
      },
    });
    expect(requests[0]!.instructions).toBe("keep the migration plan");
  });

  it("condenses a conversation that is under the automatic threshold", async () => {
    // `/compact` is an explicit request, so it does not wait for the context to
    // grow past the reserve the scheduled path watches.
    const outcome = await compactSessionHistory({
      store: store(exchange(6)),
      sessionId: "s",
      policy: { contextWindow: 1_000_000, reserveTokens: 8_000, keepRecentTokens: 300 },
      summarize: async () => "checkpoint summary",
    });
    expect(outcome.status).toBe("compacted");
  });

  it("does nothing for a short conversation and writes no entry", async () => {
    const target = store(exchange(2));
    const summarize = vi.fn(async () => "never called");
    const outcome = await compactSessionHistory({
      store: target,
      sessionId: "s",
      policy: POLICY,
      summarize,
    });
    expect(outcome.status).toBe("nothing");
    if (outcome.status !== "nothing") throw new Error("unreachable");
    expect(outcome.reason).toContain("nothing older than the recent history");
    expect(target.entries).toEqual([]);
    // Declining happens before the provider is asked, so a refusal costs nothing.
    expect(summarize).not.toHaveBeenCalled();
  });

  it("dispatches PreCompact and PostCompact around a manual condensation", async () => {
    const events: Array<{ name: string; reason: string }> = [];
    const hooks = {
      dispatch: async (payload: { eventName: string; reason: string }) => {
        events.push({ name: payload.eventName, reason: payload.reason });
        return { decision: "allow" as const };
      },
    };
    const outcome = await compactSessionHistory({
      store: store(exchange(6)),
      sessionId: "s",
      policy: POLICY,
      summarize: async () => "checkpoint summary",
      hooks: hooks as never,
      workspaceRoot: "/workspace",
      reason: "manual",
    });
    expect(outcome.status).toBe("compacted");
    expect(events).toEqual([
      { name: "PreCompact", reason: "manual" },
      { name: "PostCompact", reason: "manual" },
    ]);
  });

  it("aborts the condensation when a PreCompact hook blocks it", async () => {
    const summarize = vi.fn(async () => "never called");
    const target = store(exchange(6));
    const outcome = await compactSessionHistory({
      store: target,
      sessionId: "s",
      policy: POLICY,
      summarize,
      hooks: {
        dispatch: async () => ({ decision: "block" as const, reason: "policy" }),
      } as never,
      reason: "manual",
    });
    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") throw new Error("unreachable");
    expect(outcome.reason).toContain("refused by a PreCompact hook");
    // A refusal costs nothing: no summary requested, no entry written.
    expect(summarize).not.toHaveBeenCalled();
    expect(target.entries).toEqual([]);
  });

  it("records a checkpoint only when the condensation happened", async () => {
    const { createCompactLiveCheckpointStore, getLatestCompactCheckpoint } =
      await import("../../context/compact/checkpoint/compactLiveCheckpoint.js");
    const { createCompactInjectionStateStore } = await import(
      "../../context/compact/injection/compactInjectionState.js"
    );
    const checkpointStore = createCompactLiveCheckpointStore({
      now: () => "2026-05-15T00:00:00.000Z",
      nextId: () => "checkpoint-engine-1",
    });
    const injectionStateStore = createCompactInjectionStateStore({
      now: () => "2026-05-15T00:00:00.000Z",
    });
    const outcome = await compactSessionHistory({
      store: store(exchange(6)),
      sessionId: "s",
      policy: POLICY,
      summarize: async () => "checkpoint summary",
      checkpoint: {
        sessionScopeId: "session:checkpoint-records",
        sourceCommand: "/compact",
        projectRoot: "/workspace",
        checkpointStore,
        injectionStateStore,
      },
    });
    expect(outcome.status).toBe("compacted");
    // The checkpoint exists because the condensation happened — and it is the
    // one producer, so a second call supersedes rather than duplicates.
    expect(
      getLatestCompactCheckpoint(checkpointStore, "session:checkpoint-records")
        ?.checkpointId,
    ).toBe("checkpoint-engine-1");
    expect(
      injectionStateStore.get("session:checkpoint-records").injectionStatus,
    ).toBe("pending");

    const declined = await compactSessionHistory({
      store: store(exchange(2)),
      sessionId: "s",
      policy: POLICY,
      summarize: async () => "never called",
      checkpoint: {
        sessionScopeId: "session:checkpoint-declined",
        sourceCommand: "/compact",
        projectRoot: "/workspace",
        checkpointStore,
        injectionStateStore,
      },
    });
    expect(declined.status).toBe("nothing");
    expect(
      getLatestCompactCheckpoint(checkpointStore, "session:checkpoint-declined"),
    ).toBeUndefined();
  });

  it("refuses to replace messages with a summary that is not smaller", async () => {
    const target = store(exchange(6));
    const outcome = await compactSessionHistory({
      store: target,
      sessionId: "s",
      policy: POLICY,
      // Longer than the twelve messages it would replace, which is the shape a
      // summary takes when the history it condenses was mostly short messages.
      summarize: async () => "a summary long enough to outweigh the messages it would replace ".repeat(100),
    });
    // This is the guard that stops a context growing on every compaction. The
    // summary is discarded and the session is left exactly as it was.
    expect(outcome.status).toBe("nothing");
    if (outcome.status !== "nothing") throw new Error("unreachable");
    expect(outcome.reason).toContain("would not free any context");
    expect(target.entries).toEqual([]);
  });

  it("reports a provider that returned no summary without touching the session", async () => {
    const target = store(exchange(6));
    const outcome = await compactSessionHistory({
      store: target,
      sessionId: "s",
      policy: POLICY,
      summarize: async () => undefined,
    });
    expect(outcome).toEqual({ status: "failed", reason: "The provider returned no summary." });
    expect(target.entries).toEqual([]);
  });

  it("reports a cancelled summarization as cancelled", async () => {
    const controller = new AbortController();
    const target = store(exchange(6));
    const outcome = await compactSessionHistory({
      store: target,
      sessionId: "s",
      policy: POLICY,
      signal: controller.signal,
      summarize: async () => {
        controller.abort();
        throw new Error("This operation was aborted");
      },
    });
    expect(outcome).toEqual({ status: "failed", reason: "Compaction was cancelled." });
    expect(target.entries).toEqual([]);
  });
});
