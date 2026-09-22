import { describe, expect, it } from "vitest";
import { AgentCore } from "./agent.js";
import type { AgentLifecycleEvent } from "./events.js";
import type { AssistantStep } from "./loop.js";
import type { AgentMessage } from "./state.js";

function collect() {
  const events: AgentLifecycleEvent[] = [];
  return {
    events,
    listener: (event: AgentLifecycleEvent): void => {
      events.push(event);
    },
  };
}

function userMessage(content: string): AgentMessage {
  return { role: "user", content };
}

function answer(text: string): AssistantStep {
  return { text, toolCalls: [], stopReason: "stop" };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("AgentCore prompt", () => {
  it("runs the full lifecycle and settles the state", async () => {
    const { events, listener } = collect();
    const core = new AgentCore({
      streamStep: async () => answer("hello"),
    });
    const unsubscribe = core.subscribe(listener);

    await core.prompt([userMessage("hi")]);
    await core.waitForIdle();

    expect(core.state.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(core.state.isStreaming).toBe(false);
    expect(events.map((event) => event.type)).toEqual([
      "agent_start",
      "turn_start",
      "message_start",
      "message_end",
      "message_start",
      "message_end",
      "turn_end",
      "agent_end",
    ]);
    unsubscribe();
  });

  it("rejects a second prompt while a run is active", async () => {
    let release!: () => void;
    const gate = new Promise<AssistantStep>((resolve) => {
      release = () => resolve(answer("late"));
    });
    const core = new AgentCore({ streamStep: () => gate });

    const running = core.prompt([userMessage("hi")]);
    await settle();
    await expect(core.prompt([userMessage("again")])).rejects.toThrow("already processing");
    release();
    await running;
    await core.waitForIdle();
  });

  it("accepts a single message without an array wrapper", async () => {
    const core = new AgentCore({ streamStep: async () => answer("hi") });
    await core.prompt(userMessage("hello"));
    expect(core.state.messages).toHaveLength(2);
  });
});

describe("AgentCore abort", () => {
  it("synthesizes an aborted turn instead of leaking the abort error", async () => {
    const { events, listener } = collect();
    const core = new AgentCore({
      streamStep: (_messages, signal) =>
        new Promise<AssistantStep>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => reject(new Error("fetch aborted")),
            { once: true },
          );
        }),
    });
    core.subscribe(listener);

    const running = core.prompt([userMessage("hi")]);
    await settle();
    expect(core.state.isStreaming).toBe(true);
    core.abort();
    await running;
    await core.waitForIdle();

    expect(core.state.isStreaming).toBe(false);
    const last = core.state.messages[core.state.messages.length - 1];
    expect(last.role).toBe("assistant");
    expect(last.stopReason).toBe("aborted");
    expect(core.state.errorMessage).toBe("fetch aborted");
    const types = events.map((event) => event.type);
    expect(types.slice(-2)).toEqual(["turn_end", "agent_end"]);
  });

  it("synthesizes an error turn for non-abort failures", async () => {
    const { events, listener } = collect();
    const core = new AgentCore({
      streamStep: async () => {
        throw new Error("provider exploded");
      },
    });
    core.subscribe(listener);

    await core.prompt([userMessage("hi")]);
    await core.waitForIdle();

    const last = core.state.messages[core.state.messages.length - 1];
    expect(last.stopReason).toBe("error");
    expect(last.errorMessage).toBe("provider exploded");
    expect(events.map((event) => event.type).slice(-2)).toEqual([
      "turn_end",
      "agent_end",
    ]);
  });

  it("carries the full transcript in the failure agent_end", async () => {
    const { events, listener } = collect();
    const core = new AgentCore({
      streamStep: async () => {
        throw new Error("provider exploded");
      },
    });
    core.subscribe(listener);

    await core.prompt([userMessage("hi")]);

    const end = events.find((event) => event.type === "agent_end");
    expect(end?.type).toBe("agent_end");
    if (end?.type === "agent_end") {
      expect(end.messages.map((message) => message.role)).toEqual([
        "user",
        "assistant",
      ]);
      expect(end.messages[end.messages.length - 1].stopReason).toBe("error");
    }
  });

  it("rejects waitForIdle when a listener fails", async () => {
    const core = new AgentCore({ streamStep: async () => answer("hi") });
    core.subscribe(async (event) => {
      if (event.type === "agent_end") {
        throw new Error("listener exploded");
      }
    });

    await expect(core.prompt([userMessage("hi")])).rejects.toThrow(
      "listener exploded",
    );
    await expect(core.waitForIdle()).rejects.toThrow("listener exploded");
  });

  it("waits for slow listeners before going idle", async () => {
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const core = new AgentCore({ streamStep: async () => answer("hi") });
    core.subscribe(async (event) => {
      if (event.type === "agent_end") {
        await gate;
        order.push("listener");
      }
    });

    const running = core.prompt([userMessage("hi")]);
    await settle();
    const idle = core.waitForIdle().then(() => {
      order.push("idle");
    });
    await settle();
    expect(order).toEqual([]);
    release();
    await running;
    await idle;
    expect(order).toEqual(["listener", "idle"]);
  });
});

describe("AgentCore queues", () => {
  it("injects steered input into the running turn", async () => {
    const seen: AgentMessage[][] = [];
    let calls = 0;
    const core = new AgentCore({
      streamStep: async (messages) => {
        calls += 1;
        seen.push([...messages]);
        if (calls === 1) {
          core.steer(userMessage("actually, focus on tests"));
          return {
            text: "",
            toolCalls: [{ id: "call-1", name: "read", args: { path: "a" } }],
            stopReason: "stop",
          };
        }
        return answer("steered");
      },
      tools: [
        {
          name: "read",
          execute: async () => ({ output: "file!", isError: false }),
        },
      ],
    });

    await core.prompt([userMessage("go")]);

    expect(calls).toBe(2);
    expect(seen[1].map((message) => message.content)).toContain(
      "actually, focus on tests",
    );
    expect(core.hasQueuedMessages()).toBe(false);
  });

  it("runs follow-up input after the current task settles", async () => {
    let calls = 0;
    const core = new AgentCore({
      streamStep: async () => {
        calls += 1;
        if (calls === 1) {
          core.followUp(userMessage("and then?"));
        }
        return answer(`answer ${calls}`);
      },
    });

    await core.prompt([userMessage("go")]);

    expect(calls).toBe(2);
    expect(core.state.messages.filter((message) => message.role === "user")).toHaveLength(2);
  });

  it("clears queued input on demand", async () => {
    const core = new AgentCore({ streamStep: async () => answer("hi") });
    core.steer(userMessage("steer"));
    core.followUp(userMessage("follow"));
    expect(core.hasQueuedMessages()).toBe(true);
    core.clearAllQueues();
    expect(core.hasQueuedMessages()).toBe(false);
    await core.prompt([userMessage("go")]);
    expect(core.state.messages).toHaveLength(2);
  });

  it("restarts from queued steering when continuing after an assistant ending", async () => {
    const core = new AgentCore({ streamStep: async () => answer("done") });
    core.steer(userMessage("pick this back up"));

    await core.continue();
    await core.waitForIdle();

    expect(core.hasQueuedMessages()).toBe(false);
    const roles = core.state.messages.map((message) => message.role);
    expect(roles[roles.length - 2]).toBe("user");
    expect(roles[roles.length - 1]).toBe("assistant");
  });

  it("falls back to queued follow-up when steering is empty", async () => {
    const core = new AgentCore({ streamStep: async () => answer("done") });
    core.followUp(userMessage("next task"));

    await core.continue();
    await core.waitForIdle();

    expect(core.hasQueuedMessages()).toBe(false);
    const roles = core.state.messages.map((message) => message.role);
    expect(roles[roles.length - 2]).toBe("user");
  });

  it("still rejects continue with no queued input after an assistant ending", async () => {
    const core = new AgentCore({ streamStep: async () => answer("hi") });
    await core.prompt([userMessage("go")]);

    await expect(core.continue()).rejects.toThrow("assistant");
  });
});

describe("AgentCore continue and reset", () => {
  it("continues from a tool result message", async () => {
    const core = new AgentCore({
      initialState: {
        messages: [
          userMessage("go"),
          {
            role: "assistant",
            content: "",
            tool_calls: [
              {
                id: "call-1",
                type: "function",
                function: { name: "read", arguments: "{}" },
              },
            ],
          },
          { role: "tool", tool_call_id: "call-1", content: "file!" },
        ],
      },
      streamStep: async () => answer("resumed"),
    });

    await core.continue();

    expect(core.state.messages[core.state.messages.length - 1].content).toBe("resumed");
  });

  it("rejects continuing an empty transcript or an assistant message", async () => {
    const empty = new AgentCore({ streamStep: async () => answer("hi") });
    await expect(empty.continue()).rejects.toThrow("no messages");

    const assistantLast = new AgentCore({
      initialState: { messages: [{ role: "assistant", content: "done" }] },
      streamStep: async () => answer("hi"),
    });
    await expect(assistantLast.continue()).rejects.toThrow("assistant");
  });

  it("resets transcript and queues when idle", async () => {
    const core = new AgentCore({ streamStep: async () => answer("hi") });
    await core.prompt([userMessage("go")]);
    core.steer(userMessage("steer"));
    core.reset();

    expect(core.state.messages).toEqual([]);
    expect(core.hasQueuedMessages()).toBe(false);
  });

  it("rejects reset while a run is active", async () => {
    let release!: () => void;
    const gate = new Promise<AssistantStep>((resolve) => {
      release = () => resolve(answer("late"));
    });
    const core = new AgentCore({ streamStep: () => gate });

    const running = core.prompt([userMessage("hi")]);
    await settle();
    expect(() => core.reset()).toThrow("already processing");
    release();
    await running;
  });

  it("starts from queued steering on an empty transcript", async () => {
    const core = new AgentCore({ streamStep: async () => answer("started") });
    core.steer(userMessage("begin"));

    await core.continue();
    await core.waitForIdle();

    expect(core.hasQueuedMessages()).toBe(false);
    expect(core.state.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
  });

  it("clears the failed run barrier on reset", async () => {
    const core = new AgentCore({ streamStep: async () => answer("hi") });
    core.subscribe(async (event) => {
      if (event.type === "agent_end") {
        throw new Error("listener exploded");
      }
    });

    await expect(core.prompt([userMessage("hi")])).rejects.toThrow(
      "listener exploded",
    );
    core.reset();
    await core.waitForIdle();
    expect(core.state.messages).toEqual([]);
  });

  it("switches queue drain strategy at runtime", async () => {
    const core = new AgentCore({ streamStep: async () => answer("hi") });
    core.setQueueMode("steering", "all");
    core.steer(userMessage("first"));
    core.steer(userMessage("second"));

    await core.continue();
    await core.waitForIdle();

    expect(
      core.state.messages.filter((message) => message.role === "user"),
    ).toHaveLength(2);
  });
});
