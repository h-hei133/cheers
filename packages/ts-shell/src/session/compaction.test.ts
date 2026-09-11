import { describe, expect, it, vi } from "vitest";
import { runAgentLoop } from "../core/agent/loop.js";
import type { AgentMessage } from "../core/agent/state.js";
import type { AgentTool, AgentToolCall } from "../core/agent/tools.js";
import {
  KEEP_RECENT_MESSAGES,
  applyCompaction,
  createCompactionStep,
  findCompactionCut,
  planCompaction,
  shouldCompact,
  type CompactionPolicy,
} from "./compaction.js";

function userMessage(content: string): AgentMessage {
  return { role: "user", content };
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

const policy: CompactionPolicy = { contextWindow: 30, reserveTokens: 10, keepRecentMessages: 2 };

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

  it("lands on the newest user message that keeps the tail", () => {
    const messages = history(4);
    const cut = findCompactionCut(messages, 2);
    expect(cut).toBe(6);
    expect(messages[cut!].role).toBe("user");
    expect(messages.length - cut!).toBe(2);
  });

  it("keeps at least one full exchange before the cut", () => {
    expect(findCompactionCut(history(2), 2)).toBe(2);
    expect(findCompactionCut(history(2), 3)).toBeUndefined();
  });
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
    expect(plan?.cut).toBe(6);
    expect(plan?.keptMessages).toBe(2);
    expect(plan?.tokensBefore).toBeGreaterThan(20);
  });
});

describe("applyCompaction", () => {
  it("replaces the head with a checkpoint and keeps the tail verbatim", () => {
    const messages = history(4);
    const plan = planCompaction(messages, policy)!;
    const compacted = applyCompaction(messages, plan, "older work summary");

    expect(compacted).toHaveLength(3);
    expect(compacted[0].role).toBe("user");
    expect(compacted[0].content).toContain("older work summary");
    expect(compacted.slice(1)).toEqual(messages.slice(plan.cut));
  });
});

describe("createCompactionStep", () => {
  it("leaves small contexts untouched", async () => {
    const summarize = vi.fn(async () => "summary");
    const step = createCompactionStep({ contextWindow: 10_000 }, summarize);
    const messages = history(2);

    await expect(
      step({ message: messages[1], toolResults: [], messages }, undefined),
    ).resolves.toBeUndefined();
    expect(summarize).not.toHaveBeenCalled();
  });

  it("compacts over-threshold contexts before the next step", async () => {
    const summarize = vi.fn(async () => "older work summary");
    const step = createCompactionStep(policy, summarize);
    const messages = history(4);

    const update = await step(
      { message: messages[messages.length - 1], toolResults: [], messages },
      undefined,
    );

    expect(summarize).toHaveBeenCalledTimes(1);
    expect(update?.messages).toHaveLength(3);
    expect(update?.messages?.[0].content).toContain("older work summary");
  });

  it("falls back to the full context when summarization fails", async () => {
    const step = createCompactionStep(policy, async () => undefined);
    const messages = history(4);

    await expect(
      step({ message: messages[messages.length - 1], toolResults: [], messages }, undefined),
    ).resolves.toBeUndefined();
  });

  it("falls back to the full context when the summarizer throws", async () => {
    const step = createCompactionStep(policy, async () => {
      throw new Error("provider down");
    });
    const messages = history(4);

    await expect(
      step({ message: messages[messages.length - 1], toolResults: [], messages }, undefined),
    ).resolves.toBeUndefined();
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
      userMessage("background ".repeat(40)),
      ...history(3),
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
        prepareNextStep: createCompactionStep(policy, summarize),
      },
      () => {},
      undefined,
    );

    expect(summarize).toHaveBeenCalledTimes(1);
    expect(seen).toHaveLength(2);
    expect(seen[1].length).toBeLessThan(seen[0].length);
    expect(seen[1][0].content).toContain("background summary");
  });
});

describe("constants", () => {
  it("keeps a small verbatim tail", () => {
    expect(KEEP_RECENT_MESSAGES).toBe(4);
  });
});
