import { describe, expect, it } from "vitest";
import type { HookDispatcher } from "../core/hooks/hookDispatcher.js";
import type { QueryEvent } from "../core/query/runtime/events.js";
import type { SessionMessage } from "../session/schema/sessionMessage.js";
import type { ToolDefinition } from "../tools/types.js";
import { createTaskToolDefinition } from "../core/tools/taskTool.js";
import { runTurn, type TurnOptions } from "./session.js";
import type { StepFunction } from "./step.js";
import { CONTEXT_OVERFLOW_PREFIX } from "./step.js";

/**
 * The turn is where the kernel's lifecycle meets the shell's contract. These
 * tests hold that seam: what is persisted and when, how a run reports its
 * end, what an interruption leaves behind, and how input typed mid-run lands.
 */

const quietHooks = { dispatch: async () => ({ decision: "allow" as const }) } as unknown as HookDispatcher;

function echoTool(name: string, output: string): ToolDefinition {
  return {
    name,
    description: name,
    argsSchema: { type: "object", properties: {} },
    permissions: { check: () => [] },
    execute: async () => ({ success: true, output }),
  };
}

function scripted(steps: Array<Awaited<ReturnType<StepFunction>> | ((messages: readonly SessionMessage[]) => Awaited<ReturnType<StepFunction>>)>): StepFunction {
  let index = 0;
  return async (messages, _signal, listener) => {
    const next = steps[index++] ?? { text: "Done", toolCalls: [], stopReason: "stop" as const };
    const step = typeof next === "function" ? next(messages) : next;
    if (step.text) listener.onText?.(step.text);
    return step;
  };
}

function options(overrides: Partial<TurnOptions> = {}): TurnOptions & { readonly persisted: SessionMessage[] } {
  const persisted: SessionMessage[] = [];
  return {
    persisted,
    sessionId: "sess_turn",
    prompt: "do the thing",
    workspaceRoot: process.cwd(),
    permissionScope: "allow-all",
    history: [],
    onMessage: (message) => persisted.push(message),
    step: scripted([{ text: "All done.", toolCalls: [], stopReason: "stop" }]),
    tools: new Map(),
    hooks: quietHooks,
    maxSteps: 5,
    signal: new AbortController().signal,
    ...overrides,
  };
}

async function drain(events: AsyncIterable<QueryEvent>): Promise<QueryEvent[]> {
  const out: QueryEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

describe("runTurn", () => {
  it("streams the answer and reports a completed run", async () => {
    const setup = options();
    const events = await drain(runTurn(setup).events);
    expect(events[0]).toEqual({ type: "query.started", sessionId: "sess_turn", prompt: "do the thing" });
    expect(events.filter((event) => event.type === "message.delta")).toHaveLength(1);
    const terminal = events.at(-1);
    expect(terminal?.type).toBe("query.completed");
    if (terminal?.type === "query.completed") {
      expect(terminal.result.finalOutput).toBe("All done.");
      expect(terminal.result.sharedContext.notes).toEqual(["steps: 1"]);
    }
  });

  it("persists the assistant and tool messages but never the opening prompt", async () => {
    const setup = options({
      tools: new Map([["read", echoTool("read", "file contents")]]),
      step: scripted([
        { text: "", toolCalls: [{ id: "call_1", name: "read", args: { path: "a.txt" } }], stopReason: "stop" },
        { text: "Read it.", toolCalls: [], stopReason: "stop" },
      ]),
    });
    const events = await drain(runTurn(setup).events);
    expect(setup.persisted.map((message) => message.role)).toEqual(["assistant", "tool", "assistant"]);
    expect(setup.persisted[0].tool_calls?.[0].function.name).toBe("read");
    expect(setup.persisted[1].tool_call_id).toBe("call_1");
    expect(setup.persisted.some((message) => "stopReason" in message)).toBe(false);
    const started = events.find((event) => event.type === "tool.started");
    const result = events.find((event) => event.type === "tool.result");
    expect(started).toMatchObject({ toolName: "read", taskId: "call_1", args: { path: "a.txt" } });
    expect(result).toMatchObject({ toolName: "read", taskId: "call_1", success: true, output: "file contents" });
  });

  it("refuses tool calls the model truncated and lets it re-issue them", async () => {
    let executed = 0;
    const tool = echoTool("write", "written");
    const setup = options({
      tools: new Map([["write", { ...tool, execute: async () => { executed += 1; return { success: true, output: "written" }; } }]]),
      step: scripted([
        { text: "", toolCalls: [{ id: "call_cut", name: "write", args: { path: "a.txt" } }], stopReason: "length" },
        { text: "Retried.", toolCalls: [], stopReason: "stop" },
      ]),
    });
    const events = await drain(runTurn(setup).events);
    expect(executed).toBe(0);
    const result = events.find((event) => event.type === "tool.result");
    expect(result).toMatchObject({ success: false });
    expect((result as { output?: string }).output).toContain("output token limit");
    expect(events.at(-1)?.type).toBe("query.completed");
  });

  it("ends quietly when interrupted, keeping what was already said", async () => {
    const controller = new AbortController();
    const setup = options({
      signal: controller.signal,
      step: async (_messages, signal, listener) => {
        listener.onText?.("partial ");
        controller.abort();
        void signal;
        return { text: "partial ", toolCalls: [], stopReason: "aborted", errorMessage: "Operation aborted" };
      },
    });
    const events = await drain(runTurn(setup).events);
    expect(events.some((event) => event.type === "query.failed")).toBe(false);
    expect(events.some((event) => event.type === "query.completed")).toBe(false);
    expect(setup.persisted).toEqual([{ role: "assistant", content: "partial " }]);
  });

  it("reports a failed model call as a failed run", async () => {
    // A rejection the provider will keep giving: retrying it would spend a
    // request to learn the same thing, so the run ends here. A transient
    // failure is retried instead, which is what the retry tests cover.
    const setup = options({
      step: scripted([{ text: "", toolCalls: [], stopReason: "error", errorMessage: "Provider HTTP 401: bad key" }]),
    });
    const events = await drain(runTurn(setup).events);
    expect(events.at(-1)).toEqual({ type: "query.failed", error: "Provider HTTP 401: bad key" });
    expect(setup.persisted).toEqual([]);
  });

  it("compacts once and retries when the provider reports an overflow", async () => {
    const summaries: string[] = [];
    let calls = 0;
    // Long enough that condensing them is worth it: the guard declines when the
    // summary would cost at least what it replaces, and a fixture of two-letter
    // messages is exactly that case.
    const history: SessionMessage[] = [];
    for (let index = 0; index < 4; index += 1) {
      history.push(
        { role: "user", content: `q${index} ${"x".repeat(400)}` },
        { role: "assistant", content: `a${index} ${"y".repeat(400)}` },
      );
    }
    const setup = options({
      history,
      step: async (messages, _signal, listener) => {
        calls += 1;
        if (calls === 1) return { text: "", toolCalls: [], stopReason: "error", errorMessage: `${CONTEXT_OVERFLOW_PREFIX}too big` };
        const checkpoint = messages.find((message) => message.content.includes("[Context Checkpoint]"));
        const text = checkpoint ? "answered after compaction" : "no checkpoint";
        listener.onText?.(text);
        return { text, toolCalls: [], stopReason: "stop" };
      },
      compaction: {
        // An overflow is a context that outgrew its window, so the recent-tail
        // budget is the part of that window the compaction may keep.
        policy: { contextWindow: 1_000_000, keepRecentTokens: 300 },
        summarize: async () => "older work",
        onCompact: (record) => summaries.push(record.summary),
      },
    });
    const events = await drain(runTurn(setup).events);
    expect(summaries).toEqual(["older work"]);
    const terminal = events.at(-1);
    expect(terminal?.type).toBe("query.completed");
    if (terminal?.type === "query.completed") expect(terminal.result.finalOutput).toBe("answered after compaction");
  });

  it("reports overflow failure when the summarizer fails", async () => {
    const history: SessionMessage[] = [];
    for (let index = 0; index < 4; index += 1) {
      history.push({ role: "user", content: `q${index}` }, { role: "assistant", content: `a${index}` });
    }
    const setup = options({
      history,
      step: async () => ({ text: "", toolCalls: [], stopReason: "error" as const, errorMessage: `${CONTEXT_OVERFLOW_PREFIX}too big` }),
      compaction: {
        policy: { contextWindow: 1_000_000 },
        summarize: async () => {
          throw new Error("summarizer down");
        },
        onCompact: () => {},
      },
    });
    const events = await drain(runTurn(setup).events);
    expect(events.at(-1)).toEqual({ type: "query.failed", error: "Context overflow error: could not compact context automatically." });
  });
  it("delivers steering before the next step and follow-ups after the run would stop", async () => {
    const seen: string[] = [];
    const setup = options({
      tools: new Map([["read", echoTool("read", "contents")]]),
      step: async (messages, _signal, listener) => {
        const last = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
        seen.push(last);
        if (seen.length === 1) return { text: "", toolCalls: [{ id: "c1", name: "read", args: {} }], stopReason: "stop" };
        listener.onText?.(`ack ${last}`);
        return { text: `ack ${last}`, toolCalls: [], stopReason: "stop" };
      },
    });
    const run = runTurn(setup);
    const events: QueryEvent[] = [];
    for await (const event of run.events) {
      events.push(event);
      if (event.type === "tool.started") {
        run.steer("turn left");
        run.followUp("then stop");
        expect(run.pending()).toEqual({ steering: ["turn left"], followUps: ["then stop"] });
      }
    }
    expect(seen.slice(1)).toEqual(["turn left", "then stop"]);
    expect(run.pending()).toEqual({ steering: [], followUps: [] });
    expect(setup.persisted.filter((message) => message.role === "user").map((message) => message.content)).toEqual([
      "turn left",
      "then stop",
    ]);
  });

  it("hands undelivered input back when the queue is cleared", () => {
    const run = runTurn(options({ step: () => new Promise(() => {}) }));
    run.steer("a");
    run.followUp("b");
    expect(run.clearQueue()).toEqual(["a", "b"]);
    expect(run.pending()).toEqual({ steering: [], followUps: [] });
  });

  it("drops blank steering and follow-up input at the boundary", () => {
    const run = runTurn(options({ step: () => new Promise(() => {}) }));
    run.steer("   ");
    run.followUp("");
    expect(run.pending()).toEqual({ steering: [], followUps: [] });
  });
});

describe("tool events reach the shell before the batch is assembled", () => {
  it("reports a call settled as soon as that call stops running", async () => {
    let releaseSecond: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    const setup = options({
      tools: new Map([
        [
          "read",
          {
            ...echoTool("read", "file contents"),
            execute: async () => {
              await gate;
              return { success: true, output: "file contents" };
            },
          },
        ],
      ]),
      step: scripted([
        {
          text: "",
          toolCalls: [
            { id: "call_1", name: "read", args: { path: "a.txt" } },
            { id: "call_2", name: "read", args: { path: "b.txt" } },
          ],
          stopReason: "stop",
        },
        { text: "Read both.", toolCalls: [], stopReason: "stop" },
      ]),
    });
    const run = runTurn(setup);
    const seen: QueryEvent[] = [];
    const drained = (async () => {
      for await (const event of run.events) seen.push(event);
    })();
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Both calls started, neither has finished: nothing has settled yet.
    expect(seen.filter((event) => event.type === "tool.started")).toHaveLength(2);
    expect(seen.filter((event) => event.type === "tool.settled")).toHaveLength(0);
    releaseSecond?.();
    await drained;

    const settled = seen.filter((event) => event.type === "tool.settled");
    expect(settled).toHaveLength(2);
    // Status arrives for each call, which is what lets a card stop looking busy
    // without waiting for the whole batch. Output still arrives on tool.result.
    expect(settled.map((event) => (event as { taskId: string }).taskId).sort()).toEqual(["call_1", "call_2"]);
    expect(seen.filter((event) => event.type === "tool.result")).toHaveLength(2);
  });
});

describe("progress from a tool reaches the shell", () => {
  it("carries output a tool reports while it runs", async () => {
    const setup = options({
      tools: new Map([
        [
          "bash",
          {
            ...echoTool("bash", "final output"),
            execute: async (_args, context) => {
              // What a command tool does: report as it produces, then return.
              context.onOutput?.("part one\n");
              context.onOutput?.("part two\n");
              return { success: true, output: "final output" };
            },
          },
        ],
      ]),
      step: scripted([
        { text: "", toolCalls: [{ id: "call_1", name: "bash", args: { command: "x" } }], stopReason: "stop" },
        { text: "Done.", toolCalls: [], stopReason: "stop" },
      ]),
    });
    const events = await drain(runTurn(setup).events);

    // The adapter, the tool context, and the projection all have to line up for
    // this to appear; any one of them dropping the callback loses it silently.
    const output = events.filter((event) => event.type === "tool.output");
    expect(output.length).toBeGreaterThan(0);
    expect(output.map((event) => (event as { chunk: string }).chunk).join("")).toContain("part one");
    // The progress is not the result: the whole output still arrives separately.
    const result = events.find((event) => event.type === "tool.result") as { output?: string } | undefined;
    expect(result?.output).toContain("final output");
  });
});

describe("a subagent's calls answer to the session's rules", () => {
  /**
   * The rule reaches the door the subagent comes through.
   *
   * The session and a subagent each adapt a tool set, and the two gates were
   * built from separate option lists — the subagent's left out the user's
   * refusals. A rule that only the session's own calls obeyed is a rule that
   * holds until something delegates, which is not a rule.
   */
  it("refuses, inside the subagent, a tool the session refuses", async () => {
    const ran: string[] = [];
    const bashTool: ToolDefinition = {
      name: "bash",
      description: "run a command",
      argsSchema: { type: "object", properties: {} },
      permissions: { check: () => [] },
      execute: async () => {
        ran.push("bash");
        return { success: true, output: "ran" };
      },
    };
    const taskTool: ToolDefinition = {
      ...createTaskToolDefinition(),
    };
    const tools = new Map<string, ToolDefinition>([
      ["bash", bashTool],
      ["task", taskTool],
    ]);
    // Step 1: the session delegates. Step 2+: the subagent asks for bash.
    let n = 0;
    const step: StepFunction = async (_messages, _signal, _listener, stepOptions) => {
      n += 1;
      if (n === 1) {
        return {
          text: "",
          toolCalls: [{ id: "c1", name: "task", args: { description: "d", prompt: "run bash", subagent_type: "general" } }],
          stopReason: "stop",
        };
      }
      if (stepOptions.allowTools) {
        return { text: "", toolCalls: [{ id: `c${n}`, name: "bash", args: { command: "echo hi" } }], stopReason: "stop" };
      }
      return { text: "done", toolCalls: [], stopReason: "stop" };
    };

    const run = runTurn(
      options({
        tools,
        denyRules: [{ tool: "bash" }],
        step,
        subagentHost: { step, defaultMaxSteps: 3 },
        maxSteps: 6,
      }),
    );
    await drain(run.events);

    expect(ran).toEqual([]);
  });

  /**
   * The rule reaches the door the subagent comes through.
   *
   * The session and a subagent each adapt a tool set, and the two gates were
   * built from separate option lists — the subagent's left out the user's
   * refusals. A rule that only the session's own calls obeyed is a rule that
   * holds until something delegates, which is not a rule.
   */
  it("refuses a tool the session refuses, even when a subagent asks for it", async () => {
    const ran: string[] = [];
    const bashTool: ToolDefinition = {
      name: "bash",
      description: "run a command",
      argsSchema: { type: "object", properties: {} },
      permissions: { check: () => [] },
      execute: async () => {
        ran.push("bash");
        return { success: true, output: "ran" };
      },
    };
    // The subagent's own step asks for bash. Without the rule reaching its gate
    // this call is executed, which is the failure this pins.
    const step: StepFunction = async (_messages, _signal, _listener, stepOptions) => {
      if (stepOptions.allowTools) {
        return { text: "", toolCalls: [{ id: "c1", name: "bash", args: { command: "echo hi" } }], stopReason: "stop" };
      }
      return { text: "answered", toolCalls: [], stopReason: "stop" };
    };

    const run = runTurn(
      options({
        tools: new Map([["bash", bashTool]]),
        denyRules: [{ tool: "bash" }],
        step,
        subagentHost: { step, defaultMaxSteps: 3 },
      }),
    );
    await drain(run.events);

    expect(ran).toEqual([]);
  });
});
