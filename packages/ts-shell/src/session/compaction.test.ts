import { describe, expect, it, vi } from "vitest";
import { runAgentLoop } from "../core/agent/loop.js";
import type { AgentMessage } from "../core/agent/state.js";
import type { AgentTool, AgentToolCall } from "../core/agent/tools.js";
import {
  KEEP_RECENT_TOKENS,
  applyCompaction,
  condenseContext,
  createCompactionStep,
  findCompactionCut,
  planCompaction,
  readContextCheckpoint,
  shouldCompact,
  type CompactionPolicy,
} from "./compaction.js";

function userMessage(content: string): AgentMessage {
  return { role: "user", content };
}

function systemMessage(content: string): AgentMessage {
  return { role: "system", content };
}

function assistantMessage(content: string): AgentMessage {
  return { role: "assistant", content };
}

function exchange(prompt: string, answer: string): AgentMessage[] {
  return [userMessage(prompt), assistantMessage(answer)];
}

function history(exchanges: number): AgentMessage[] {
  const messages: AgentMessage[] = [];
  for (let index = 0; index < exchanges; index += 1) {
    messages.push(...exchange(`question ${index}`, `answer ${index}`));
  }
  return messages;
}

/**
 * A budget just under one exchange's worth of characters, so the cut lands on
 * the newest boundary and keeps a two-message tail — the same shape the
 * message-count fixture used to produce.
 */
const policy: CompactionPolicy = { contextWindow: 30, reserveTokens: 10, keepRecentTokens: 10 };

/**
 * A history whose messages are long enough that condensing them is worth it.
 *
 * The short `history` fixture cannot be compacted at all: its messages total
 * fewer characters than any summary of them, so the engine declines. That is
 * the guard working, not a limitation, and it is covered on its own below.
 */
function longHistory(exchanges: number): AgentMessage[] {
  const messages: AgentMessage[] = [];
  for (let index = 0; index < exchanges; index += 1) {
    messages.push(
      userMessage(`question ${index} ${"x".repeat(400)}`),
      assistantMessage(`answer ${index} ${"y".repeat(400)}`),
    );
  }
  return messages;
}

/**
 * A budget for `longHistory`: the window sits below what four long exchanges
 * cost (938 tokens), so the threshold is crossed and the cut lands inside the
 * newest exchange, keeping three messages and condensing five.
 */
const longPolicy: CompactionPolicy = { contextWindow: 900, reserveTokens: 0, keepRecentTokens: 300 };

describe("shouldCompact", () => {
  it("fires only past the reserved headroom", () => {
    expect(shouldCompact(90, 100, 10)).toBe(false);
    expect(shouldCompact(91, 100, 10)).toBe(true);
  });

  it("stays quiet when compaction is disabled", () => {
    expect(shouldCompact(10_000, 100, 10, false)).toBe(false);
  });
});

describe("findCompactionCut", () => {
  it("returns nothing when there is too little to condense", () => {
    expect(findCompactionCut(history(1), 2)).toBeUndefined();
    expect(findCompactionCut([], 2)).toBeUndefined();
  });

  it("lands on the newest message that can start the tail", () => {
    const messages = history(4);
    const cut = findCompactionCut(messages, 5);
    expect(cut?.cut).toBe(6);
    expect(messages[cut!.cut].role).toBe("user");
    expect(cut?.splitsTurn).toBe(false);
  });

  it("keeps about the budgeted amount rather than the newest exchange", () => {
    expect(findCompactionCut(history(4), 5)?.cut).toBe(6);
    expect(findCompactionCut(history(4), 10)?.cut).toBe(4);
  });

  it("cuts inside a turn when one turn is larger than the budget", () => {
    const messages = history(4);
    const cut = findCompactionCut(messages, 2);
    // The budget is spent before the opening user message is reached, so the cut
    // lands on the assistant message that follows it, and the turn opener is
    // reported separately so its request is not lost.
    expect(cut?.cut).toBe(7);
    expect(messages[cut!.cut].role).toBe("assistant");
    expect(cut?.splitsTurn).toBe(true);
    expect(cut?.turnStart).toBe(6);
    expect(messages[cut!.turnStart].role).toBe("user");
  });

  it("decides whether to cut at all in planCompaction, not here", () => {
    expect(planCompaction(history(2), { contextWindow: 10_000, reserveTokens: 0 })).toBeUndefined();
  });
});

  it("accepts a cut whose head closes its own tool calls", () => {
    const messages: AgentMessage[] = [
      userMessage("read it"),
      {
        role: "assistant",
        content: "",
        tool_calls: [
          { id: "call-1", type: "function", function: { name: "read", arguments: "{}" } },
        ],
      },
      { role: "tool", tool_call_id: "call-1", content: "file!" },
      assistantMessage("got it"),
      userMessage("next question"),
      assistantMessage("answer"),
    ];
    // The head ends before the tool result, so the call it answers stays paired
    // with it rather than being discarded alone.
    const cut = findCompactionCut(messages, 2);
    expect(cut?.cut).toBe(4);
    expect(cut?.splitsTurn).toBe(false);
  });

  it("cuts on the assistant call when trailing tool results exceed the budget", () => {
    const messages: AgentMessage[] = [
      userMessage("earlier question"),
      assistantMessage("earlier answer"),
      userMessage("start"),
      {
        role: "assistant",
        content: "",
        tool_calls: [
          { id: "call-1", type: "function", function: { name: "read", arguments: "{}" } },
          { id: "call-2", type: "function", function: { name: "read", arguments: "{}" } },
        ],
      },
      { role: "tool", tool_call_id: "call-1", content: "x".repeat(400) },
      { role: "tool", tool_call_id: "call-2", content: "x".repeat(400) },
    ];
    // A tail cannot start on a tool result, and backing up past the result for
    // call-1 would strand call-2. The newest legal cut is the assistant message
    // that made both calls, keeping them together with their results.
    const cut = findCompactionCut(messages, 5);
    expect(cut?.cut).toBe(3);
    expect(messages[cut!.cut].role).toBe("assistant");
  });

  it("notifies the transcript record when compaction applies", async () => {
    const seen: { readonly summary: string; readonly keptMessages: number; readonly tokensBefore: number }[] = [];
    const step = createCompactionStep(longPolicy, {
      summarize: async () => "older work",
      onCompact: (input) => {
        seen.push(input);
      },
    });
    const messages = longHistory(4);
    const update = await step(
      { message: messages[messages.length - 1]!, toolResults: [], messages },
      undefined,
    );
    expect(update).not.toBeUndefined();
    expect(seen).toHaveLength(1);
    expect(seen[0]!.summary).toBe("older work");
    expect(seen[0]!.keptMessages).toBeGreaterThan(0);
  });

describe("planCompaction", () => {
  it("returns nothing under the threshold", () => {
    expect(planCompaction(history(4), { contextWindow: 10_000, reserveTokens: 10 })).toBeUndefined();
  });

  it("returns nothing when no cut exists", () => {
    expect(planCompaction(history(1), { contextWindow: 1, reserveTokens: 0 })).toBeUndefined();
  });

  it("plans the cut with token accounting", () => {
    const messages = history(4);
    const plan = planCompaction(messages, policy);
    // The fixture budget keeps four messages, not merely the newest exchange.
    expect(plan?.cut).toBe(4);
    expect(plan?.keptMessages).toBe(4);
    expect(plan?.tokensBefore).toBeGreaterThan(20);
  });
});

describe("applyCompaction", () => {
  it("replaces the head with a checkpoint and keeps the tail verbatim", () => {
    const messages = history(4);
    const plan = planCompaction(messages, policy)!;
    const compacted = applyCompaction(messages, plan, "older work summary");

    expect(compacted).toHaveLength(1 + plan.keptMessages);
    expect(compacted[0].role).toBe("user");
    expect(compacted[0].content).toContain("older work summary");
    expect(compacted.slice(1)).toEqual(messages.slice(plan.cut));
  });
});

describe("the checkpoint position a later compaction depends on", () => {
  /**
   * The reader only ever looks for the checkpoint at one position: directly after a
   * leading system message, or at the front. That is not an accident of the
   * implementation — it is what makes "the conversation already begins with a
   * summary" a fact the next compaction can rely on rather than a search.
   *
   * Checked as a round trip because the two halves live in different functions:
   * `applyCompaction` decides where the checkpoint goes, and `condenseContext`
   * decides where to look. Either can regress alone, and the failure is silent —
   * the checkpoint stops being recognised, the summary is condensed a second time,
   * and each pass sheds a little of what it said.
   */
  it("writes the checkpoint where the next compaction looks for it", async () => {
    const messages = [systemMessage("rules"), ...history(6)];
    const plan = planCompaction(messages, policy)!;
    const compacted = applyCompaction(messages, plan, "prior summary");

    // Where it was written.
    const checkpointIndex = compacted.findIndex((message) => readContextCheckpoint(message.content) !== undefined);
    expect(checkpointIndex).toBe(1);
    expect(compacted[0]!.role).toBe("system");

    // And that the reader finds it there. More history is appended first, because a
    // compaction immediately after one declines — there is nothing new to condense,
    // and declining is the correct answer rather than a case to force.
    const grown = [...compacted, userMessage(`later ${"z".repeat(600)}`), assistantMessage(`answer ${"w".repeat(600)}`)];
    const seen: Array<string | undefined> = [];
    await condenseContext({
      messages: grown,
      policy: { contextWindow: 100, reserveTokens: 0, keepRecentTokens: 300 },
      force: true,
      summarize: async (request) => {
        seen.push(request.previousSummary);
        return "revised";
      },
    });
    expect(seen[0]).toBe("prior summary");
  });

  it("still recognises the checkpoint when there is no system message", async () => {
    // The other position the reader accepts. Without a system message the
    // checkpoint is the first message, and the reader has to look there instead.
    const messages = history(6);
    const plan = planCompaction(messages, policy)!;
    const compacted = applyCompaction(messages, plan, "prior summary");
    expect(readContextCheckpoint(compacted[0]!.content)).toBe("prior summary");

    const grown = [...compacted, userMessage(`later ${"z".repeat(600)}`), assistantMessage(`answer ${"w".repeat(600)}`)];
    const seen: Array<string | undefined> = [];
    await condenseContext({
      messages: grown,
      policy: { contextWindow: 100, reserveTokens: 0, keepRecentTokens: 300 },
      force: true,
      summarize: async (request) => {
        seen.push(request.previousSummary);
        return "revised";
      },
    });
    expect(seen[0]).toBe("prior summary");
  });
});

describe("createCompactionStep", () => {
  it("leaves small contexts untouched", async () => {
    const summarize = vi.fn(async () => "summary");
    const step = createCompactionStep({ contextWindow: 10_000 }, { summarize });
    const messages = history(2);

    await expect(
      step({ message: messages[1], toolResults: [], messages }, undefined),
    ).resolves.toBeUndefined();
    expect(summarize).not.toHaveBeenCalled();
  });

  it("compacts over-threshold contexts before the next step", async () => {
    const summarize = vi.fn(async () => "older work summary");
    const step = createCompactionStep(longPolicy, { summarize });
    const messages = longHistory(4);

    const update = await step(
      { message: messages[messages.length - 1]!, toolResults: [], messages },
      undefined,
    );

    expect(summarize).toHaveBeenCalledTimes(1);
    // The checkpoint replaces the head and the newest three messages stay.
    expect(update?.messages).toHaveLength(1 + 3);
    expect(update?.messages?.[0]!.content).toContain("older work summary");
  });

  it("falls back to the full context when summarization fails", async () => {
    const step = createCompactionStep(longPolicy, { summarize: async () => undefined });
    const messages = longHistory(4);

    await expect(
      step({ message: messages[messages.length - 1]!, toolResults: [], messages }, undefined),
    ).resolves.toBeUndefined();
  });

  it("falls back to the full context when the summarizer throws", async () => {
    const step = createCompactionStep(longPolicy, {
      summarize: async () => {
        throw new Error("provider down");
      },
    });
    const messages = longHistory(4);

    await expect(
      step({ message: messages[messages.length - 1]!, toolResults: [], messages }, undefined),
    ).resolves.toBeUndefined();
  });
});

describe("compaction pairing and policy guards", () => {
  it("applies the default reserve when the policy omits it", () => {
    const long = userMessage("background ".repeat(300));
    const messages = [long, ...history(4)];
    expect(
      planCompaction(messages, { contextWindow: 2000, reserveTokens: 0 }),
    ).toBeUndefined();
    expect(planCompaction(messages, { contextWindow: 2000 })).not.toBeUndefined();
  });

  it("skips cuts when a tool call has no result anywhere", () => {
    const dangling: AgentMessage[] = [
      userMessage("start"),
      {
        role: "assistant",
        content: "",
        tool_calls: [
          { id: "call-1", type: "function", function: { name: "read", arguments: "{}" } },
        ],
      },
      userMessage("tail prompt"),
    ];
    expect(findCompactionCut(dangling, 1)).toBeUndefined();
  });

  it("keeps the opening system prompt ahead of the checkpoint", () => {
    const messages: AgentMessage[] = [
      { role: "system", content: "behave" },
      ...history(4),
    ];
    const plan = planCompaction(messages, policy)!;
    const compacted = applyCompaction(messages, plan, "older work summary");
    expect(compacted[0].role).toBe("system");
    expect(compacted[0].content).toBe("behave");
    expect(compacted[1].content).toContain("older work summary");
  });

  it("reports summarizer failures through onError", async () => {
    const errors: unknown[] = [];
    const step = createCompactionStep(longPolicy, {
      summarize: async () => {
        throw new Error("provider down");
      },
      onError: (error) => {
        errors.push(error);
      },
    });
    const messages = longHistory(4);
    await step(
      { message: messages[messages.length - 1]!, toolResults: [], messages },
      undefined,
    );
    expect(errors).toHaveLength(1);
  });

  it("stays silent on abort without reporting failure", async () => {
    const errors: unknown[] = [];
    const controller = new AbortController();
    controller.abort();
    const step = createCompactionStep(longPolicy, {
      summarize: async () => "never",
      onError: (error) => {
        errors.push(error);
      },
    });
    const messages = longHistory(4);
    const summary = step(
      { message: messages[messages.length - 1]!, toolResults: [], messages },
      controller.signal,
    );
    await expect(summary).resolves.toBeUndefined();
    expect(errors).toHaveLength(0);
  });
});

describe("compaction through the kernel hook", () => {
  it("shrinks the context the next model step sees", async () => {
    const call: AgentToolCall = { id: "call-1", name: "read", args: { path: "a.txt" } };
    const seen: AgentMessage[][] = [];
    const tools: AgentTool[] = [
      {
        name: "read",
        execute: async () => ({ output: "file!", isError: false }),
      },
    ];
    const seed: AgentMessage[] = [
      userMessage("background ".repeat(400)),
      ...longHistory(3),
    ];
    const summarize = vi.fn(async () => "background summary");

    await runAgentLoop(
      [userMessage("go")],
      seed,
      {
        tools,
        streamStep: async (messages) => {
          seen.push([...messages]);
          if (seen.length === 1) {
            return { text: "", toolCalls: [call], stopReason: "stop" };
          }
          return { text: "done", toolCalls: [], stopReason: "stop" };
        },
        prepareNextStep: createCompactionStep(longPolicy, { summarize }),
      },
      () => {},
      undefined,
    );

    expect(summarize).toHaveBeenCalledTimes(1);
    expect(seen).toHaveLength(2);
    expect(seen[1]!.length).toBeLessThan(seen[0]!.length);
    expect(seen[1]![0]!.content).toContain("background summary");
  });
});

describe("constants", () => {
  it("keeps a recent tail measured in tokens", () => {
    expect(KEEP_RECENT_TOKENS).toBe(20_000);
  });
});

/**
 * One turn far larger than the budget: the user asks once, then the model works
 * through many tool calls. No later user message exists to cut at, so a
 * user-only cut would have nothing to work with.
 */
function giantTurn(): AgentMessage[] {
  const messages: AgentMessage[] = [userMessage("rework the parser")];
  for (let index = 0; index < 6; index += 1) {
    const id = `call-${index}`;
    messages.push({
      role: "assistant",
      content: "",
      tool_calls: [{ id, type: "function", function: { name: "read", arguments: "{}" } }],
    });
    messages.push({ role: "tool", tool_call_id: id, content: "x".repeat(400) });
  }
  messages.push(assistantMessage("finished"));
  return messages;
}

describe("a single turn larger than the budget", () => {
  const giantPolicy: CompactionPolicy = { contextWindow: 600, reserveTokens: 0, keepRecentTokens: 300 };
  const withHistory = (): AgentMessage[] => [
    userMessage("earlier ask"),
    assistantMessage("earlier answer"),
    ...giantTurn(),
  ];
  it("summarizes the turn opening separately from the older history", async () => {
    const summarize = vi.fn(async () => "history summary");
    const summarizeTurnPrefix = vi.fn(async () => "turn opener summary");

    const condensed = await condenseContext({
      messages: withHistory(),
      policy: giantPolicy,
      summarize,
      summarizeTurnPrefix,
    });

    expect(condensed.status).toBe("condensed");
    if (condensed.status !== "condensed") throw new Error("unreachable");
    expect(condensed.plan.splitsTurn).toBe(true);
    // The kept tail is the end of the turn, so its opening request is not in it
    // and is reachable only through the second summary.
    expect(summarizeTurnPrefix).toHaveBeenCalledTimes(1);
    expect(summarizeTurnPrefix.mock.calls[0]![0][0]!.content).toBe("rework the parser");
    // Both summaries reach the context as one checkpoint.
    expect(condensed.summary).toContain("history summary");
    expect(condensed.summary).toContain("turn opener summary");
  });

  it("falls back to the history summary when the prefix cannot be summarized", async () => {
    const condensed = await condenseContext({
      messages: withHistory(),
      policy: giantPolicy,
      summarize: async () => "history summary",
      summarizeTurnPrefix: async () => undefined,
    });
    // Losing the opener costs context, but refusing to compact costs more: the
    // context was already judged too large, and the kept tail still continues.
    expect(condensed.status).toBe("condensed");
    if (condensed.status !== "condensed") throw new Error("unreachable");
    expect(condensed.summary).toBe("history summary");
  });

  it("refuses to drop history it could not summarize", async () => {
    const condensed = await condenseContext({
      messages: withHistory(),
      policy: giantPolicy,
      summarize: async () => undefined,
      summarizeTurnPrefix: async () => "opener only",
    });
    // The opener alone does not describe the turns being discarded, so replacing
    // the head with it would lose them without a trace.
    expect(condensed).toEqual({ status: "declined", reason: "unsummarized" });
  });
});

describe("a compaction that would not shrink the context", () => {
  /**
   * A conversation of very short exchanges. A summary of it costs more than the
   * messages it would replace, which is the shape the manual path used to
   * produce when it kept a fixed count of messages: every pass made the context
   * larger instead of smaller.
   */
  const brief = (): AgentMessage[] => history(4);

  it("declines instead of replacing short messages with a longer summary", async () => {
    const condensed = await condenseContext({
      messages: brief(),
      policy,
      summarize: async () => "a summary that costs more than the conversation it replaces",
    });
    expect(condensed).toEqual({ status: "declined", reason: "would-not-shrink" });
  });

  it("declines when the conversation already fits the recent-tail budget", async () => {
    // Nothing is older than the tail the budget keeps, so a checkpoint would
    // replace nothing and still cost its own size.
    const condensed = await condenseContext({
      messages: brief(),
      policy: { contextWindow: 30, reserveTokens: 10, keepRecentTokens: 10_000 },
      summarize: async () => "summary",
    });
    expect(condensed).toEqual({ status: "declined", reason: "fits-budget" });
  });

  it("tells a conversation with no legal cut apart from one that fits its budget", async () => {
    // Every candidate boundary sits inside an open tool call, so there is
    // history to replace but nowhere safe to cut it — a different refusal from
    // "nothing is older than the kept tail".
    const dangling: AgentMessage[] = [
      userMessage("start"),
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "call-1", type: "function", function: { name: "read", arguments: "{}" } }],
      },
      userMessage(`tail prompt ${"z".repeat(200)}`),
    ];
    const condensed = await condenseContext({
      messages: dangling,
      policy: { contextWindow: 1_000, reserveTokens: 0, keepRecentTokens: 1 },
      force: true,
      summarize: async () => "summary",
    });
    expect(condensed).toEqual({ status: "declined", reason: "no-legal-cut" });
  });

  it("condenses the same conversation once the messages outweigh the summary", async () => {
    const condensed = await condenseContext({
      messages: longHistory(4),
      policy: longPolicy,
      summarize: async () => "short summary",
    });
    // The guard is about size, not about refusing to compact: the same shape of
    // conversation goes through as soon as condensing it actually frees space.
    expect(condensed.status).toBe("condensed");
  });
});

describe("repeated compaction", () => {
  /**
   * A checkpoint from an earlier compaction, then two long exchanges. The cut
   * lands inside the newest exchange, so the checkpoint is what the history
   * summary is asked to revise.
   */
  const afterCheckpoint = (): AgentMessage[] => [
    userMessage("[Context Checkpoint]\nprior checkpoint text"),
    userMessage(`q0 ${"x".repeat(600)}`),
    assistantMessage(`a0 ${"y".repeat(600)}`),
    userMessage(`q1 ${"x".repeat(600)}`),
    assistantMessage(`a1 ${"y".repeat(600)}`),
  ];
  /** A window well under what those exchanges cost, so the threshold is crossed. */
  const repeatPolicy: CompactionPolicy = { contextWindow: 100, reserveTokens: 0, keepRecentTokens: 300 };

  it("revises the checkpoint it finds instead of summarizing it again", async () => {
    const seen: Array<{ messages: number; previousSummary?: string }> = [];
    const condensed = await condenseContext({
      messages: afterCheckpoint(),
      policy: repeatPolicy,
      force: true,
      summarize: async (request) => {
        seen.push({ messages: request.messages.length, previousSummary: request.previousSummary });
        return "revised";
      },
    });

    expect(condensed.status).toBe("condensed");
    // The earlier checkpoint travels as the summary to revise rather than as one
    // more message to condense — condensing a condensation sheds a little of
    // what it said on every pass.
    expect(seen).toHaveLength(1);
    expect(seen[0]!.previousSummary).toBe("prior checkpoint text");
    expect(seen[0]!.messages).toBe(2);
  });

  it("carries a checkpoint forward when there is nothing new to condense", async () => {
    const summarize = vi.fn(async () => "should not be called");
    // The checkpoint and one long exchange: everything before the kept tail is
    // the checkpoint itself, whose own text is already the summary to carry.
    const condensed = await condenseContext({
      messages: [
        userMessage("[Context Checkpoint]\nprior checkpoint text"),
        userMessage(`q1 ${"x".repeat(600)}`),
        assistantMessage(`a1 ${"y".repeat(600)}`),
      ],
      policy: repeatPolicy,
      force: true,
      summarize,
    });

    expect(condensed.status).toBe("condensed");
    if (condensed.status !== "condensed") throw new Error("unreachable");
    expect(condensed.summary).toBe("prior checkpoint text");
    expect(summarize).not.toHaveBeenCalled();
  });
});
