import { describe, expect, it } from "vitest";
import type { AgentLifecycleEvent } from "./events.js";
import type { AssistantStep } from "./loop.js";
import { runAgentLoop, runAgentLoopContinue } from "./loop.js";
import type { AgentMessage } from "./state.js";
import type { AgentTool, AgentToolCall } from "./tools.js";

function collect() {
  const events: AgentLifecycleEvent[] = [];
  return {
    events,
    emit: (event: AgentLifecycleEvent): void => {
      events.push(event);
    },
  };
}

function eventTypes(events: readonly AgentLifecycleEvent[]): string[] {
  return events.map((event) => event.type);
}

function userMessage(content: string): AgentMessage {
  return { role: "user", content };
}

function textStep(text: string): AssistantStep {
  return { text, toolCalls: [], stopReason: "stop" };
}

function toolStep(calls: readonly AgentToolCall[], stopReason: AssistantStep["stopReason"] = "stop"): AssistantStep {
  return { text: "", toolCalls: calls, stopReason };
}

function scriptedStream(steps: readonly AssistantStep[]) {
  const seen: AgentMessage[][] = [];
  let index = 0;
  return {
    seen,
    streamStep: async (messages: readonly AgentMessage[]): Promise<AssistantStep> => {
      seen.push([...messages]);
      const step = steps[Math.min(index, steps.length - 1)];
      index += 1;
      return step;
    },
  };
}

function readTool(): AgentTool {
  return {
    name: "read",
    execute: async (_id, args) => ({
      output: `contents of ${String((args as Record<string, unknown>).path)}`,
      isError: false,
    }),
  };
}

describe("runAgentLoop", () => {
  it("runs a text-only turn through the full lifecycle", async () => {
    const { seen, streamStep } = scriptedStream([textStep("hello")]);
    const { events, emit } = collect();

    const messages = await runAgentLoop(
      [userMessage("hi")],
      [],
      { streamStep },
      emit,
      undefined,
    );

    expect(eventTypes(events)).toEqual([
      "agent_start",
      "turn_start",
      "message_start",
      "message_end",
      "message_start",
      "message_end",
      "turn_end",
      "agent_end",
    ]);
    expect(messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(messages[1].content).toBe("hello");
    expect(seen).toHaveLength(1);
    expect(seen[0].map((message) => message.role)).toEqual(["user"]);
  });

  it("carries the step's origin onto the message it becomes", async () => {
    // The loop is where a step's fields become a message's fields. An origin
    // the loop drops is one no later reader can ever see, so the handoff is
    // what gets pinned here.
    const { streamStep } = scriptedStream([{ text: "hello", toolCalls: [], stopReason: "stop", origin: { provider: "p", model: "m" } }]);
    const { emit } = collect();
    const messages = await runAgentLoop([userMessage("hi")], [], { streamStep }, emit, undefined);
    expect(messages[1].origin).toEqual({ provider: "p", model: "m" });
  });

  it("executes tool calls and continues until the model answers", async () => {
    const call: AgentToolCall = { id: "call-1", name: "read", args: { path: "a.txt" } };
    const { streamStep } = scriptedStream([toolStep([call]), textStep("done")]);
    const { events, emit } = collect();
    let executed = 0;
    const tools: AgentTool[] = [
      {
        name: "read",
        execute: async () => {
          executed += 1;
          return { output: "file!", isError: false };
        },
      },
    ];

    const messages = await runAgentLoop([userMessage("read it")], [], { streamStep, tools }, emit, undefined);

    expect(executed).toBe(1);
    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
    expect(messages[2].tool_call_id).toBe("call-1");
    expect(messages[2].content).toBe("file!");
    expect(eventTypes(events)).toContain("tool_execution_start");
    expect(eventTypes(events)).toContain("tool_execution_end");
    const toolIndex = eventTypes(events).indexOf("tool_execution_start");
    expect(eventTypes(events).slice(toolIndex, toolIndex + 4)).toEqual([
      "tool_execution_start",
      "tool_execution_end",
      "message_start",
      "message_end",
    ]);
    expect(eventTypes(events).filter((type) => type === "turn_end")).toHaveLength(2);
    expect(eventTypes(events).filter((type) => type === "agent_end")).toHaveLength(1);
  });

  it("refuses to execute tool calls cut off by the output limit", async () => {
    const call: AgentToolCall = { id: "call-1", name: "read", args: { path: "a.txt" } };
    const { streamStep } = scriptedStream([toolStep([call], "length"), textStep("recovered")]);
    const { emit } = collect();
    let executed = 0;
    const tools: AgentTool[] = [
      {
        name: "read",
        execute: async () => {
          executed += 1;
          return { output: "must not run", isError: false };
        },
      },
    ];

    const messages = await runAgentLoop([userMessage("read it")], [], { streamStep, tools }, emit, undefined);

    expect(executed).toBe(0);
    const toolMessage = messages.find((message) => message.role === "tool");
    expect(toolMessage?.content).toContain("not executed");
    expect(messages[messages.length - 1].content).toBe("recovered");
  });
  it("ends the run immediately on an errored assistant message", async () => {
    const { streamStep } = scriptedStream([
      { text: "", toolCalls: [], stopReason: "error", errorMessage: "boom" },
    ]);
    const { events, emit } = collect();

    const messages = await runAgentLoop([userMessage("hi")], [], { streamStep }, emit, undefined);

    expect(eventTypes(events).slice(-2)).toEqual(["turn_end", "agent_end"]);
    expect(messages[messages.length - 1].stopReason).toBe("error");
  });

  it("injects steering messages before the next assistant response", async () => {
    const { seen, streamStep } = scriptedStream([toolStep([]), textStep("steered")]);
    const { events, emit } = collect();
    const steering: AgentMessage[] = [userMessage("focus on tests")];
    let polls = 0;

    await runAgentLoop(
      [userMessage("go")],
      [],
      {
        streamStep,
        getSteeringMessages: async () => {
          polls += 1;
          return polls === 2 ? [...steering] : [];
        },
      },
      emit,
      undefined,
    );

    expect(polls).toBeGreaterThan(0);
    expect(seen[1].map((message) => message.content)).toContain("focus on tests");
    const steeringEnd = events.find(
      (event) => event.type === "message_end" && event.message.content === "focus on tests",
    );
    expect(steeringEnd).toBeDefined();
  });

  it("drains follow-up messages after the run would otherwise stop", async () => {
    const { seen, streamStep } = scriptedStream([textStep("first"), textStep("second")]);
    const { events, emit } = collect();
    let polls = 0;

    await runAgentLoop(
      [userMessage("go")],
      [],
      {
        streamStep,
        getFollowUpMessages: async () => {
          polls += 1;
          return polls === 1 ? [userMessage("and then?")] : [];
        },
      },
      emit,
      undefined,
    );

    expect(polls).toBe(2);
    expect(seen).toHaveLength(2);
    expect(seen[1].map((message) => message.content)).toContain("and then?");
    expect(eventTypes(events).filter((type) => type === "agent_end")).toHaveLength(1);
  });

  it("stops early when shouldStopAfterTurn asks to", async () => {
    const call: AgentToolCall = { id: "call-1", name: "read", args: { path: "a.txt" } };
    const { streamStep } = scriptedStream([toolStep([call]), textStep("never")]);
    const { events, emit } = collect();

    await runAgentLoop(
      [userMessage("go")],
      [],
      {
        streamStep,
        tools: [readTool()],
        shouldStopAfterStep: () => true,
      },
      emit,
      undefined,
    );

    const assistantEnds = events.filter(
      (event) => event.type === "message_end" && event.message.role === "assistant",
    );
    expect(assistantEnds).toHaveLength(1);
    expect(eventTypes(events).slice(-1)).toEqual(["agent_end"]);
  });
  it("lets prepareNextStep replace the context for the next turn", async () => {
    const call: AgentToolCall = { id: "call-1", name: "read", args: { path: "a.txt" } };
    const { seen, streamStep } = scriptedStream([toolStep([call]), textStep("done")]);
    const { emit } = collect();

    await runAgentLoop(
      [userMessage("go")],
      [],
      {
        streamStep,
        tools: [readTool()],
        prepareNextStep: async (step) => ({
          messages: step.messages.filter((message) => message.role !== "tool"),
        }),
      },
      emit,
      undefined,
    );

    expect(seen).toHaveLength(2);
    expect(seen[1].some((message) => message.role === "tool")).toBe(false);
  });

  it("keeps tool results pairable when the signal is already aborted", async () => {
    const call: AgentToolCall = { id: "call-1", name: "read", args: { path: "a.txt" } };
    const { streamStep } = scriptedStream([toolStep([call]), textStep("done")]);
    const { emit } = collect();
    const controller = new AbortController();
    controller.abort();
    let executed = 0;
    const tools: AgentTool[] = [
      {
        name: "read",
        execute: async () => {
          executed += 1;
          return { output: "must not run", isError: false };
        },
      },
    ];

    const messages = await runAgentLoop(
      [userMessage("go")],
      [],
      { streamStep, tools },
      emit,
      controller.signal,
    );

    expect(executed).toBe(0);
    expect(messages.find((message) => message.role === "tool")?.content).toBe(
      "Operation aborted",
    );
  });
});

describe("runAgentLoopContinue", () => {
  it("rejects an empty transcript", async () => {
    const { emit } = collect();
    const { streamStep } = scriptedStream([textStep("hi")]);
    await expect(runAgentLoopContinue([], { streamStep }, emit, undefined)).rejects.toThrow(
      "no messages",
    );
  });

  it("rejects continuing from an assistant message", async () => {
    const { emit } = collect();
    const { streamStep } = scriptedStream([textStep("hi")]);
    await expect(
      runAgentLoopContinue(
        [{ role: "assistant", content: "done" }],
        { streamStep },
        emit,
        undefined,
      ),
    ).rejects.toThrow("assistant");
  });

  it("continues from a tool result without a new prompt", async () => {
    const { streamStep } = scriptedStream([textStep("resumed")]);
    const { events, emit } = collect();

    const messages = await runAgentLoopContinue(
      [
        { role: "user", content: "go" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            { id: "call-1", type: "function", function: { name: "read", arguments: "{}" } },
          ],
        },
        { role: "tool", tool_call_id: "call-1", content: "file!" },
      ],
      { streamStep },
      emit,
      undefined,
    );

    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe("resumed");
    expect(eventTypes(events)[0]).toBe("agent_start");
  });
});

describe("step retry", () => {
  it("asks for the step again after a transient failure", async () => {
    let attempts = 0;
    const { events, emit } = collect();

    const messages = await runAgentLoop(
      [userMessage("hi")],
      [],
      {
        retry: { enabled: true, maxRetries: 2, baseDelayMs: 1, maxDelayMs: 1 },
        streamStep: async () => {
          attempts += 1;
          if (attempts === 1) {
            return { text: "", toolCalls: [], stopReason: "error", errorMessage: "Provider HTTP 503: busy" };
          }
          return textStep("recovered");
        },
      },
      emit,
      undefined,
    );

    expect(attempts).toBe(2);
    expect(messages[messages.length - 1]?.content).toBe("recovered");
    expect(eventTypes(events)).toContain("retry_scheduled");
  });

  it("announces the wait before it takes it", async () => {
    // A silent pause during a backoff reads as a hang, so the wait is reported
    // while it is happening rather than after.
    const { events, emit } = collect();
    let attempts = 0;

    await runAgentLoop(
      [userMessage("hi")],
      [],
      {
        retry: { enabled: true, maxRetries: 1, baseDelayMs: 1, maxDelayMs: 1 },
        streamStep: async () => {
          attempts += 1;
          return attempts === 1
            ? { text: "", toolCalls: [], stopReason: "error", errorMessage: "Network error: fetch failed" }
            : textStep("ok");
        },
      },
      emit,
      undefined,
    );

    const scheduled = events.findIndex((event) => event.type === "retry_scheduled");
    const started = events.findIndex((event) => event.type === "retry_attempt_start");
    expect(scheduled).toBeGreaterThan(-1);
    expect(started).toBeGreaterThan(scheduled);
  });

  it("gives up when the failure will not change", async () => {
    let attempts = 0;
    const { events, emit } = collect();

    const messages = await runAgentLoop(
      [userMessage("hi")],
      [],
      {
        retry: { enabled: true, maxRetries: 3, baseDelayMs: 1, maxDelayMs: 1 },
        streamStep: async () => {
          attempts += 1;
          return { text: "", toolCalls: [], stopReason: "error", errorMessage: "Provider HTTP 401: bad key" };
        },
      },
      emit,
      undefined,
    );

    expect(attempts).toBe(1);
    expect(eventTypes(events)).not.toContain("retry_scheduled");
    expect(messages[messages.length - 1]?.stopReason).toBe("error");
  });

  it("stops at the configured count", async () => {
    let attempts = 0;
    const { emit } = collect();

    await runAgentLoop(
      [userMessage("hi")],
      [],
      {
        retry: { enabled: true, maxRetries: 2, baseDelayMs: 1, maxDelayMs: 1 },
        streamStep: async () => {
          attempts += 1;
          return { text: "", toolCalls: [], stopReason: "error", errorMessage: "Provider HTTP 500: error" };
        },
      },
      emit,
      undefined,
    );

    // The first attempt plus two retries.
    expect(attempts).toBe(3);
  });

  it("does not retry when the user turned retrying off", async () => {
    let attempts = 0;
    const { emit } = collect();

    await runAgentLoop(
      [userMessage("hi")],
      [],
      {
        retry: { enabled: false, maxRetries: 3, baseDelayMs: 1, maxDelayMs: 1 },
        streamStep: async () => {
          attempts += 1;
          return { text: "", toolCalls: [], stopReason: "error", errorMessage: "Provider HTTP 503: busy" };
        },
      },
      emit,
      undefined,
    );

    expect(attempts).toBe(1);
  });

  it("never retries a cancelled run", async () => {
    let attempts = 0;
    const controller = new AbortController();
    const { emit } = collect();

    await runAgentLoop(
      [userMessage("hi")],
      [],
      {
        retry: { enabled: true, maxRetries: 3, baseDelayMs: 1, maxDelayMs: 1 },
        streamStep: async () => {
          attempts += 1;
          controller.abort();
          return { text: "", toolCalls: [], stopReason: "aborted", errorMessage: "Operation aborted" };
        },
      },
      emit,
      controller.signal,
    );

    expect(attempts).toBe(1);
  });
});
