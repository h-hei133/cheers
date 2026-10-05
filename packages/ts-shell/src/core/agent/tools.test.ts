import { describe, expect, it } from "vitest";
import type { AgentLifecycleEvent } from "./events.js";
import type { AgentMessage } from "./state.js";
import {
  boundText,
  createToolResultMessage,
  executeToolBatch,
  failTruncatedCalls,
  parseToolArgs,
  prepareToolCall,
  shouldTerminateBatch,
  type AgentTool,
  type AgentToolCall,
} from "./tools.js";

function assistantMessage(): AgentMessage {
  return { role: "assistant", content: "" };
}

function collect() {
  const events: AgentLifecycleEvent[] = [];
  return {
    events,
    emit: (event: AgentLifecycleEvent): void => {
      events.push(event);
    },
  };
}

function makeTool(overrides?: Partial<AgentTool>): AgentTool {
  return {
    name: "read",
    execute: async () => ({ output: "file contents", isError: false }),
    ...overrides,
  };
}

function makeCall(overrides?: Partial<AgentToolCall>): AgentToolCall {
  return { id: "call-1", name: "read", args: { path: "a.txt" }, ...overrides };
}

describe("parseToolArgs", () => {
  it("parses complete JSON arguments", () => {
    const parsed = parseToolArgs('{"path":"a.txt"}');
    expect(parsed).toEqual({ args: { path: "a.txt" } });
  });

  it("reports malformed arguments instead of throwing", () => {
    const parsed = parseToolArgs("{not json");
    expect("parseError" in parsed).toBe(true);
  });
});

describe("boundText", () => {
  it("keeps short output untouched", () => {
    expect(boundText("ok")).toBe("ok");
  });

  it("truncates long output to the limit", () => {
    expect(boundText("abcdef", 4)).toBe("abcd\n\n[... output truncated to 4 chars]");
  });
});

describe("createToolResultMessage", () => {
  it("pairs the result with its tool call id", () => {
    const message = createToolResultMessage("call-1", "done");
    expect(message.role).toBe("tool");
    expect(message.tool_call_id).toBe("call-1");
    expect(message.content).toBe("done");
  });
});

describe("failTruncatedCalls", () => {
  it("never executes tools and returns re-issue errors", async () => {
    const { events, emit } = collect();

    const results = await failTruncatedCalls([makeCall()], emit);

    expect(results).toHaveLength(1);
    expect(results[0].role).toBe("tool");
    expect(results[0].tool_call_id).toBe("call-1");
    expect(results[0].content).toContain("not executed");
    expect(results[0].content).toContain("output token limit");
    expect(events.map((event) => event.type)).toEqual([
      "tool_execution_start",
      "tool_execution_end",
      "message_start",
      "message_end",
    ]);
    expect(events[1].type).toBe("tool_execution_end");
    if (events[1].type === "tool_execution_end") {
      expect(events[1].isError).toBe(true);
    }
  });
});

describe("prepareToolCall", () => {
  it("reports unknown tools without executing anything", async () => {
    const prepared = await prepareToolCall(
      [makeTool()],
      assistantMessage(),
      makeCall({ name: "missing" }),
      undefined,
      undefined,
    );
    expect(prepared.kind).toBe("immediate");
    if (prepared.kind === "immediate") {
      expect(prepared.result.isError).toBe(true);
      expect(prepared.result.output).toContain("not found");
    }
  });

  it("honors a blocking before hook", async () => {
    const prepared = await prepareToolCall(
      [makeTool()],
      assistantMessage(),
      makeCall(),
      {
        beforeToolCall: async () => ({ block: true, reason: "denied by policy" }),
      },
      undefined,
    );
    expect(prepared.kind).toBe("immediate");
    if (prepared.kind === "immediate") {
      expect(prepared.result.isError).toBe(true);
      expect(prepared.result.output).toContain("denied by policy");
    }
  });

  it("turns an aborted signal into an immediate aborted outcome", async () => {
    const controller = new AbortController();
    controller.abort();
    const prepared = await prepareToolCall(
      [makeTool()],
      assistantMessage(),
      makeCall(),
      undefined,
      controller.signal,
    );
    expect(prepared.kind).toBe("immediate");
    if (prepared.kind === "immediate") {
      expect(prepared.result.output).toBe("Operation aborted");
    }
  });

  it("turns argument preparation failures into immediate errors", async () => {
    const prepared = await prepareToolCall(
      [
        makeTool({
          prepareArguments: () => {
            throw new Error("bad shape");
          },
        }),
      ],
      assistantMessage(),
      makeCall(),
      undefined,
      undefined,
    );
    expect(prepared.kind).toBe("immediate");
    if (prepared.kind === "immediate") {
      expect(prepared.result.isError).toBe(true);
      expect(prepared.result.output).toContain("bad shape");
    }
  });
});

describe("executeToolBatch", () => {
  it("executes calls in parallel while keeping result order", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tools = [
      makeTool({
        name: "first",
        execute: async () => {
          concurrent += 1;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await gate;
          concurrent -= 1;
          return { output: "first out", isError: false };
        },
      }),
      makeTool({
        name: "second",
        execute: async () => {
          concurrent += 1;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await gate;
          concurrent -= 1;
          return { output: "second out", isError: false };
        },
      }),
    ];
    const { emit } = collect();

    const pending = executeToolBatch(
      tools,
      assistantMessage(),
      [
        makeCall({ id: "call-a", name: "first" }),
        makeCall({ id: "call-b", name: "second" }),
      ],
      undefined,
      "parallel",
      undefined,
      emit,
    );
    for (let attempt = 0; attempt < 100 && concurrent < 2; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(concurrent).toBe(2);
    release();
    const batch = await pending;

    expect(maxConcurrent).toBe(2);
    expect(batch.terminate).toBe(false);
    expect(batch.messages.map((message) => message.tool_call_id)).toEqual([
      "call-a",
      "call-b",
    ]);
    expect(batch.messages.map((message) => message.content)).toEqual([
      "first out",
      "second out",
    ]);
  });

  it("executes calls one by one in sequential mode", async () => {
    const order: string[] = [];
    const tools = [
      makeTool({
        name: "first",
        execute: async () => {
          order.push("first");
          return { output: "first out", isError: false };
        },
      }),
      makeTool({
        name: "second",
        execute: async () => {
          order.push("second");
          return { output: "second out", isError: false };
        },
      }),
    ];
    const { emit } = collect();

    await executeToolBatch(
      tools,
      assistantMessage(),
      [
        makeCall({ id: "call-a", name: "first" }),
        makeCall({ id: "call-b", name: "second" }),
      ],
      undefined,
      "sequential",
      undefined,
      emit,
    );

    expect(order).toEqual(["first", "second"]);
  });

  it("forces sequential execution when a tool opts out of parallelism", async () => {
    const order: string[] = [];
    const tools = [
      makeTool({
        name: "first",
        execute: async () => {
          order.push("first");
          return { output: "first out", isError: false };
        },
      }),
      makeTool({
        name: "second",
        executionMode: "sequential",
        execute: async () => {
          order.push("second");
          return { output: "second out", isError: false };
        },
      }),
    ];
    const { emit } = collect();

    await executeToolBatch(
      tools,
      assistantMessage(),
      [
        makeCall({ id: "call-a", name: "first" }),
        makeCall({ id: "call-b", name: "second" }),
      ],
      undefined,
      "parallel",
      undefined,
      emit,
    );

    expect(order).toEqual(["first", "second"]);
  });

  it("bounds oversized tool output at the pairing point", async () => {
    const tools = [
      makeTool({
        execute: async () => ({ output: "x".repeat(10_500), isError: false }),
      }),
    ];
    const { emit } = collect();

    const batch = await executeToolBatch(
      tools,
      assistantMessage(),
      [makeCall()],
      undefined,
      "sequential",
      undefined,
      emit,
    );

    expect(batch.messages).toHaveLength(1);
    expect(batch.messages[0].content.startsWith("x".repeat(10_000))).toBe(true);
    expect(batch.messages[0].content).toContain("[... output truncated to 10000 chars]");
  });

  it("synthesizes aborted results for every call left unpaired", async () => {
    let gate!: () => void;
    const started = new Promise<void>((resolve) => {
      gate = resolve;
    });
    const tools = [
      makeTool({
        execute: async () => {
          await started;
          return { output: "late", isError: false };
        },
      }),
    ];
    const controller = new AbortController();
    const { events, emit } = collect();

    const pending = executeToolBatch(
      tools,
      assistantMessage(),
      [makeCall({ id: "call-a" }), makeCall({ id: "call-b" })],
      undefined,
      "sequential",
      controller.signal,
      emit,
    );
    controller.abort();
    gate();
    const batch = await pending;

    expect(batch.messages.map((message) => message.tool_call_id)).toEqual([
      "call-a",
      "call-b",
    ]);
    expect(
      batch.messages.every((message) => message.content === "Operation aborted"),
    ).toBe(true);
    expect(
      events.filter((event) => event.type === "tool_execution_end"),
    ).toHaveLength(2);
  });

  it("lets the after hook override the executed outcome", async () => {
    const tools = [makeTool()];
    const { emit } = collect();

    const batch = await executeToolBatch(
      tools,
      assistantMessage(),
      [makeCall()],
      {
        afterToolCall: async () => ({ output: "redacted", isError: true }),
      },
      "sequential",
      undefined,
      emit,
    );

    expect(batch.messages[0].content).toBe("redacted");
    expect(batch.terminate).toBe(false);
  });

  it.each(["feedback", "throw"])("preserves failed result and artifact metadata through an after hook %s", async (mode) => {
    const tools = [makeTool({ execute: async () => ({
      output: "partial write; artifact: recovery.txt", isError: true,
      metadata: { artifact: "recovery.txt", status: "partial" },
    }) })];
    const { emit, events } = collect();
    const batch = await executeToolBatch(tools, assistantMessage(), [makeCall()], {
      afterToolCall: async () => {
        if (mode === "throw") throw new Error("verification unavailable");
        return { output: "partial write; artifact: recovery.txt\nfeedback", isError: false, metadata: { approval: "allow-once" } };
      },
    }, "sequential", undefined, emit);
    expect(batch.messages[0].content).toContain("artifact: recovery.txt");
    expect(batch.messages[0].metadata).toMatchObject({ artifact: "recovery.txt", status: "partial" });
    expect(events).toContainEqual(expect.objectContaining({ type: "tool_execution_end", isError: true }));
    if (mode === "feedback") expect(batch.messages[0].metadata?.approval).toBe("allow-once");
  });

  it("emits message events for each tool result", async () => {
    const tools = [makeTool()];
    const { events, emit } = collect();

    const batch = await executeToolBatch(
      tools,
      assistantMessage(),
      [makeCall({ id: "call-1" }), makeCall({ id: "call-2" })],
      undefined,
      "sequential",
      undefined,
      emit,
    );

    expect(batch.messages).toHaveLength(2);
    expect(
      events.filter((event) => event.type === "message_start"),
    ).toHaveLength(2);
    expect(events.filter((event) => event.type === "message_end")).toHaveLength(
      2,
    );
  });

  it("marks the batch failed when the after hook throws", async () => {
    const tools = [makeTool()];
    const { emit } = collect();

    const batch = await executeToolBatch(
      tools,
      assistantMessage(),
      [makeCall()],
      {
        afterToolCall: async () => {
          throw new Error("hook exploded");
        },
      },
      "sequential",
      undefined,
      emit,
    );

    expect(batch.messages[0].content).toContain("hook exploded");
    expect(batch.terminate).toBe(false);
  });

  it("keeps the transcript pairable when the signal is already aborted", async () => {
    let executed = 0;
    const tools = [
      makeTool({
        execute: async () => {
          executed += 1;
          return { output: "must not run", isError: false };
        },
      }),
    ];
    const controller = new AbortController();
    controller.abort();
    const { emit } = collect();

    const batch = await executeToolBatch(
      tools,
      assistantMessage(),
      [makeCall()],
      undefined,
      "sequential",
      controller.signal,
      emit,
    );

    expect(executed).toBe(0);
    expect(batch.messages).toHaveLength(1);
    expect(batch.messages[0].content).toBe("Operation aborted");
  });
});

describe("shouldTerminateBatch", () => {
  it("stops only when every result asks to terminate", () => {
    expect(shouldTerminateBatch([])).toBe(false);
    expect(
      shouldTerminateBatch([
        { output: "a", isError: false, terminate: true },
        { output: "b", isError: false },
      ]),
    ).toBe(false);
    expect(
      shouldTerminateBatch([
        { output: "a", isError: false, terminate: true },
        { output: "b", isError: true, terminate: true },
      ]),
    ).toBe(true);
  });
});
