import { describe, expect, it, vi } from "vitest";
import type { AgentMessage } from "../core/agent/state.js";
import { estimateTokens } from "./context.js";
import { findCompactionCut, planCompaction, planCompactionCut, type CompactionPolicy } from "./compaction.js";

const u = (c: string): AgentMessage => ({ role: "user", content: c });
const a = (c: string): AgentMessage => ({ role: "assistant", content: c });

/** A conversation whose messages are long enough that a cut exists at all. */
function longConversation(exchanges: number): AgentMessage[] {
  const messages: AgentMessage[] = [];
  for (let index = 0; index < exchanges; index += 1) {
    messages.push(u(`q${index} ${"x".repeat(400)}`), a(`a${index} ${"y".repeat(400)}`));
  }
  return messages;
}

describe("the provider's measurement drives the threshold", () => {
  it("consults the provider's count before deciding whether the context is too large", () => {
    const messages = longConversation(8);

    // Text alone estimates to well under the window, so the threshold is not
    // crossed by the estimate.
    expect(
      planCompaction(messages, { contextWindow: 64_000, reserveTokens: 8_000, keepRecentTokens: 600 }),
    ).toBeUndefined();

    // The provider reports 60k of a 64k window, so the context has outgrown it.
    const measured = vi.fn(() => 60_000);
    const withUsage = planCompaction(messages, {
      contextWindow: 64_000,
      reserveTokens: 8_000,
      keepRecentTokens: 600,
      measureContextTokens: measured,
    });

    // The measurement is what tells the threshold the context is too large —
    // the estimate alone cannot see it.
    expect(measured).toHaveBeenCalled();
    expect(withUsage).not.toBeUndefined();
  });

  it("compacts a long conversation the provider reports as oversized", () => {
    const messages = longConversation(8);
    const plan = planCompaction(messages, {
      contextWindow: 64_000,
      reserveTokens: 8_000,
      keepRecentTokens: 600,
      measureContextTokens: () => 60_000,
    });
    expect(plan).not.toBeUndefined();
    expect(messages[plan!.cut]!.role).not.toBe("tool");
  });

  it("declines when the request is large only because of overhead, not the conversation", () => {
    // Eight short exchanges: the whole conversation is smaller than the budget
    // the window reserves for recent history, so there is nothing to replace.
    const messages = [];
    for (let i = 0; i < 4; i += 1) messages.push(u(`q${i}`), a(`a${i}`));

    const plan = planCompaction(messages, {
      contextWindow: 64_000,
      reserveTokens: 8_000,
      // The default budget, as the CLI uses it.
      keepRecentTokens: 20_000,
      // The provider reports a large request — but the size is the system
      // prompt and tool schemas, which condensing the conversation cannot touch.
      measureContextTokens: () => 60_000,
    });

    // Declining is the honest answer: summarizing four short messages frees
    // nothing, and the overhead that made the request large is still there.
    expect(plan).toBeUndefined();
  });
});

describe("the provider's measurement never moves the cut", () => {
  /**
   * The reported defect: a 16-message conversation of ~18.4k estimated tokens
   * compacted down to 3 messages, freeing 333 tokens, because the provider's
   * count (~25k, including the system prompt and tool schemas) was divided into
   * the 20k budget. The conversation was comfortably inside its budget and the
   * overhead of the request had nothing to do with it.
   */
  const conversation = (): AgentMessage[] => longConversation(8);

  it("cuts in the same place whether or not the provider has reported a size", () => {
    const messages = conversation();
    const withoutMeasurement = planCompactionCut(messages, {
      contextWindow: 64_000,
      reserveTokens: 8_000,
      keepRecentTokens: 600,
    });
    // Every measurement from below the budget to far above it — including the
    // overhead-heavy range that produced the defect — must cut identically.
    for (const measured of [1_000, 20_000, 25_000, 40_000, 60_000]) {
      const withMeasurement = planCompactionCut(messages, {
        contextWindow: 64_000,
        reserveTokens: 8_000,
        keepRecentTokens: 600,
        measureContextTokens: () => measured,
      });
      expect(withMeasurement?.cut).toBe(withoutMeasurement?.cut);
      expect(withMeasurement?.keptMessages).toBe(withoutMeasurement?.keptMessages);
    }
  });

  it("declines rather than cutting three messages out of a conversation inside its budget", () => {
    // The exact shape from the report: a small conversation plus a provider
    // count that is larger than the conversation because of fixed overhead.
    const messages = longConversation(8);
    const estimated = estimateTokens(messages);
    expect(estimated).toBeLessThan(20_000);

    const plan = planCompactionCut(messages, {
      contextWindow: 64_000,
      reserveTokens: 8_000,
      // The default budget, as the CLI uses it.
      keepRecentTokens: 20_000,
      measureContextTokens: () => estimated + 7_000,
    });

    // Nothing is older than the budget keeps, so there is nothing to replace.
    expect(plan).toBeUndefined();
  });

  it("keeps the budget in conversation tokens, not request tokens", () => {
    const messages = longConversation(8);
    const budget = 600;
    // The walk must spend exactly the budget against the conversation's own
    // estimate, regardless of what the provider reported.
    const expected = findCompactionCut(messages, budget);
    const planned = planCompactionCut(messages, {
      contextWindow: 64_000,
      reserveTokens: 8_000,
      keepRecentTokens: budget,
      measureContextTokens: () => 500_000,
    });
    expect(planned?.cut).toBe(expected?.cut);
  });
});

describe("a budget larger than the window", () => {
  it("is clamped so a cut can still be found", () => {
    const messages = longConversation(8);
    const policy: CompactionPolicy = {
      contextWindow: 400,
      reserveTokens: 0,
      keepRecentTokens: 10_000,
    };
    // Without the clamp the budget would exceed anything the window could hold,
    // so no cut would ever be found and compaction could never run.
    expect(planCompactionCut(messages, policy)).not.toBeUndefined();
  });
});
