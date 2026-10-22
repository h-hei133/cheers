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

  it("uses the request budget's soft band when output headroom is known", () => {
    const messages = longConversation(8);
    const base = {
      contextWindow: 64_000,
      reserveTokens: 8_000,
      keepRecentTokens: 600,
      measureContextTokens: () => 48_000,
    };

    // The old reserve-only threshold was 56,000. With an 8,000-token output
    // ceiling the shared budget's soft band is 48,000, so equality must fire.
    expect(planCompaction(messages, base)).toBeUndefined();
    expect(planCompaction(messages, { ...base, outputTokens: 8_000 })).not.toBeUndefined();
    expect(planCompaction(messages, { ...base, outputTokens: 8_000, measureContextTokens: () => 47_999 })).toBeUndefined();
  });

  it("fires at an independent input ceiling even below the shared soft band", () => {
    const messages = longConversation(8);
    expect(planCompaction(messages, {
      contextWindow: 64_000,
      inputLimit: 50_000,
      reserveTokens: 8_000,
      outputTokens: 8_000,
      keepRecentTokens: 600,
      measureContextTokens: () => 45_000,
    })).not.toBeUndefined();
    expect(planCompaction(messages, {
      contextWindow: 64_000,
      inputLimit: 50_000,
      reserveTokens: 8_000,
      keepRecentTokens: 600,
      measureContextTokens: () => 45_000,
    })).not.toBeUndefined();
  });

  it("applies the soft band to an input ceiling when output is provider-owned", () => {
    const messages = longConversation(8);
    expect(planCompaction(messages, {
      contextWindow: 64_000,
      inputLimit: 50_000,
      reserveTokens: 8_000,
      keepRecentTokens: 600,
      measureContextTokens: () => 42_000,
    })).not.toBeUndefined();
    expect(planCompaction(messages, {
      contextWindow: 64_000,
      inputLimit: 50_000,
      reserveTokens: 8_000,
      keepRecentTokens: 600,
      measureContextTokens: () => 41_999,
    })).toBeUndefined();
  });

  it("keeps an explicit disabled policy from triggering through the output-aware band", () => {
    const messages = longConversation(8);
    expect(planCompaction(messages, {
      contextWindow: 64_000,
      reserveTokens: 8_000,
      outputTokens: 8_000,
      keepRecentTokens: 600,
      enabled: false,
      measureContextTokens: () => 60_000,
    })).toBeUndefined();
  });

  it("passes the effective request identity to the measurement callback", () => {
    const messages = longConversation(8);
    const identity = { schemaDigest: "schema", systemDigest: "system" };
    const measured = vi.fn(() => 60_000);
    planCompaction(messages, {
      contextWindow: 64_000,
      reserveTokens: 8_000,
      keepRecentTokens: 600,
      promptIdentity: identity,
      measureContextTokens: measured,
    });
    expect(measured).toHaveBeenCalledWith(messages, identity);
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

  it("leaves room for the output ceiling when clamping the retained tail", () => {
    const messages = longConversation(8);
    const withoutOutput = planCompactionCut(messages, {
      contextWindow: 1_000,
      reserveTokens: 100,
      keepRecentTokens: 10_000,
    });
    const withOutput = planCompactionCut(messages, {
      contextWindow: 1_000,
      reserveTokens: 100,
      outputTokens: 800,
      keepRecentTokens: 10_000,
    });
    expect(withoutOutput).not.toBeUndefined();
    expect(withOutput).not.toBeUndefined();
    expect(withOutput!.keptMessages).toBeLessThan(withoutOutput!.keptMessages);
  });

  it("leaves room for an independent input ceiling when clamping the retained tail", () => {
    const messages = longConversation(30);
    const withoutLimit = planCompactionCut(messages, {
      contextWindow: 5_000,
      reserveTokens: 100,
      keepRecentTokens: 10_000,
    });
    const withLimit = planCompactionCut(messages, {
      contextWindow: 5_000,
      inputLimit: 800,
      reserveTokens: 100,
      keepRecentTokens: 10_000,
    });
    expect(withoutLimit).not.toBeUndefined();
    expect(withLimit).not.toBeUndefined();
    expect(withLimit!.keptMessages).toBeLessThan(withoutLimit!.keptMessages);
  });
});

describe("the request's fixed overhead", () => {
  // The instruction and the tool declarations travel as their own parameters,
  // so an estimate over `messages` alone cannot see them. It matters most on a
  // cold start, which is exactly when no provider count exists to fall back on.
  //
  // Measured: a 20,000-character instruction plus one tool declaration is about
  // 5,720 tokens, while eight exchanges of this conversation are about 1,843.
  const overhead = { systemPrompt: "s".repeat(20_000), tools: [{ name: "read" }] };

  it("counts towards the threshold when no request has reported usage", () => {
    // Eight exchanges estimate to ~1,843, comfortably inside a 16,000 window
    // with an 8,000 reserve. Adding the overhead puts the request at ~7,563,
    // still inside — so the window is tightened to where the two differ.
    const messages = longConversation(8);
    const window = { contextWindow: 4_000, reserveTokens: 1_000, keepRecentTokens: 200 };

    expect(planCompaction(messages, window)).toBeUndefined();
    expect(planCompaction(messages, { ...window, overhead })).not.toBeUndefined();
  });

  it("does not double-count once the provider has measured the request", () => {
    // The provider's number already covers the instruction and the tools, so
    // adding the overhead on top of it would count them twice and compact early.
    const messages = longConversation(8);
    const policy: CompactionPolicy = {
      contextWindow: 16_000,
      reserveTokens: 8_000,
      keepRecentTokens: 200,
      overhead,
    };

    // 9,000 is over 16,000 - 8,000, so this compacts on the measurement alone.
    expect(planCompaction(messages, { ...policy, measureContextTokens: () => 9_000 })).not.toBeUndefined();
    // 7,000 is under it, and the overhead must not push it over.
    expect(planCompaction(messages, { ...policy, measureContextTokens: () => 7_000 })).toBeUndefined();
  });

  it("never moves the cut", () => {
    // The budget is about the conversation. The overhead is a fixed cost that
    // does not shrink as history is dropped, so letting it into the cut would
    // scale the budget by something the cut cannot change.
    const messages = longConversation(8);
    const base = { contextWindow: 64_000, reserveTokens: 8_000, keepRecentTokens: 600 };

    expect(planCompactionCut(messages, { ...base, overhead })?.cut).toBe(
      planCompactionCut(messages, base)?.cut,
    );
  });
});
