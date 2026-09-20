import { describe, expect, it } from "vitest";
import { getSessionUsage, recordSessionUsage } from "../../observability/usageTelemetry.js";
import type { SessionMessage } from "../../session/schema/sessionMessage.js";
import { compactionCut, compactSessionHistory, type CompactionStore } from "./compaction.js";

const PROVIDER = { baseUrl: "https://provider.test/v1", apiKey: "k", model: "m" };

function exchange(count: number): SessionMessage[] {
  const turns: SessionMessage[] = [];
  for (let i = 0; i < count; i++) {
    turns.push({ role: "user", content: `question ${i} ${"x".repeat(200)}` });
    turns.push({ role: "assistant", content: `answer ${i} ${"y".repeat(200)}` });
  }
  return turns;
}

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

describe("compaction cut", () => {
  it("lands on the newest user message that leaves the recent tail intact", () => {
    const turns = exchange(5);
    // Ten messages, keep four: the cut is the user message at index 6.
    expect(compactionCut(turns, 4)).toBe(6);
    expect(turns[6]!.role).toBe("user");
  });

  it("refuses when fewer than one exchange would be condensed", () => {
    expect(compactionCut(exchange(2), 4)).toBeUndefined();
    expect(compactionCut(exchange(3), 4)).toBe(2);
  });

  it("walks back past a tool group so the tail starts with a question", () => {
    const turns: SessionMessage[] = [
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
      { role: "user", content: "c" },
      { role: "assistant", content: "", tool_calls: [{ id: "t1", type: "function", function: { name: "bash", arguments: "{}" } }] },
      { role: "tool", content: "out", tool_call_id: "t1" },
      { role: "assistant", content: "d" },
    ];
    expect(compactionCut(turns, 2)).toBe(2);
  });
});

describe("session compaction", () => {
  it("condenses the older messages, keeps the tail, and forgets the stale context gauge", async () => {
    const turns = exchange(6);
    const target = store(turns);
    recordSessionUsage("sess_compact", { promptTokens: 9_000, completionTokens: 100 });
    const summarizeCalls: number[] = [];
    const outcome = await compactSessionHistory({
      store: target,
      sessionId: "sess_compact",
      provider: PROVIDER,
      summarize: async (request) => {
        summarizeCalls.push(request.messages.length);
        return "checkpoint summary";
      },
    });
    expect(outcome).toEqual({ status: "compacted", summarized: 8, kept: 4, tokensBefore: expect.any(Number), tokensAfter: expect.any(Number) });
    if (outcome.status !== "compacted") throw new Error("unreachable");
    expect(outcome.tokensAfter).toBeLessThan(outcome.tokensBefore);
    expect(summarizeCalls).toEqual([8]);
    expect(target.entries).toEqual([{ summary: "checkpoint summary", keptMessages: 4 }]);
    expect(getSessionUsage("sess_compact").lastPromptTokens).toBe(0);
    expect(getSessionUsage("sess_compact").totalTokens).toBe(9_100);
  });

  it("does nothing for a short conversation and writes no entry", async () => {
    const target = store(exchange(2));
    const outcome = await compactSessionHistory({
      store: target,
      sessionId: "s",
      provider: PROVIDER,
      summarize: async () => "never called",
    });
    expect(outcome.status).toBe("nothing");
    expect(target.entries).toEqual([]);
  });

  it("reports a provider that returned no summary without touching the session", async () => {
    const target = store(exchange(6));
    const outcome = await compactSessionHistory({ store: target, sessionId: "s", provider: PROVIDER, summarize: async () => undefined });
    expect(outcome).toEqual({ status: "failed", reason: "The provider returned no summary." });
    expect(target.entries).toEqual([]);
  });

  it("reports a cancelled summarization as cancelled", async () => {
    const controller = new AbortController();
    const target = store(exchange(6));
    const outcome = await compactSessionHistory({
      store: target,
      sessionId: "s",
      provider: PROVIDER,
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

describe("a head that would strand a tool call", () => {
  it("refuses the cut rather than splitting a call from its result", () => {
    const turns: SessionMessage[] = [
      { role: "user", content: "start" },
      { role: "assistant", content: "", tool_calls: [{ id: "call-1", type: "function", function: { name: "read", arguments: "{}" } }] },
      { role: "user", content: "new question" },
    ];
    // Cutting here would keep the new question and drop the assistant message,
    // leaving call-1 with no result on either side of the cut.
    expect(compactionCut(turns, 1)).toBeUndefined();
  });

  it("still cuts when the head closes its own calls", () => {
    const turns: SessionMessage[] = [
      { role: "user", content: "start" },
      { role: "assistant", content: "", tool_calls: [{ id: "call-1", type: "function", function: { name: "read", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "call-1", content: "file" },
      { role: "user", content: "new question" },
    ];
    expect(compactionCut(turns, 1)).toBe(3);
  });
});
