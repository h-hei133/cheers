import { describe, expect, it } from "vitest";
import type { AgentMessage } from "../agent/state.js";
import type { AgentTool } from "../agent/tools.js";
import type { AssistantStep } from "../agent/loop.js";
import { runSubagent } from "./runner.js";

/**
 * Running a subagent.
 *
 * The property these pin is the one that did not exist: a subagent runs the same
 * loop the main session runs, so it can call tools and act on what they return.
 * It used to be a single completion request with no tools at all, which meant a
 * delegated "fix this" could research and then stop.
 */

function tool(name: string, onCall: () => void): AgentTool {
  return {
    name,
    execute: async () => {
      onCall();
      return { output: `${name} ran`, isError: false };
    },
  };
}

/** A step that calls one tool, then answers. */
function stepThatCallsOnce(name: string): () => Promise<AssistantStep> {
  let calls = 0;
  return async () => {
    calls += 1;
    if (calls === 1) {
      return {
        text: "let me look",
        toolCalls: [{ id: "c1", name, args: {} }],
        stopReason: "stop",
      };
    }
    return { text: "the answer", toolCalls: [], stopReason: "stop" };
  };
}

const HOST_BASE = { defaultMaxSteps: 10 };

describe("running a subagent", () => {
  it("calls the tools the definition allows and reports what it said", async () => {
    let ran = 0;
    const tools = new Map<string, AgentTool>([["read", tool("read", () => { ran += 1; })]]);

    const result = await runSubagent(
      {
        definition: { name: "Explore", description: "look", systemPrompt: "look around", tools: ["read"], source: "builtin" },
        prompt: "look at the thing",
        workspace: "/tmp",
      },
      { tools, step: stepThatCallsOnce("read"), ...HOST_BASE },
    );

    expect(ran).toBe(1);
    expect(result.text).toContain("the answer");
    expect(result.failed).toBe(false);
    expect(result.steps).toBe(2);
  });

  it("does not give the subagent a tool its definition disallows", async () => {
    // The boundary as the subagent experiences it: the tool is not in the set it
    // was handed, so a call to it cannot resolve.
    const called: string[] = [];
    const tools = new Map<string, AgentTool>([
      ["read", tool("read", () => called.push("read"))],
      ["write", tool("write", () => called.push("write"))],
    ]);

    const result = await runSubagent(
      {
        definition: {
          name: "Explore",
          description: "look",
          systemPrompt: "look around",
          tools: ["read"],
          disallowedTools: ["write"],
          source: "builtin",
        },
        prompt: "look",
        workspace: "/tmp",
      },
      { tools, step: stepThatCallsOnce("read"), ...HOST_BASE },
    );

    expect(result.allowedTools).toEqual(["read"]);
    expect(result.allowedTools).not.toContain("write");
    expect(called).toEqual(["read"]);
  });

  it("stops at the definition's step limit", async () => {
    // A delegated run has nobody watching it, so a loop has to be bounded by
    // something other than the model deciding to stop.
    const tools = new Map<string, AgentTool>([["read", tool("read", () => {})]]);
    let steps = 0;
    const neverStops = async (): Promise<AssistantStep> => {
      steps += 1;
      return { text: "still going", toolCalls: [{ id: `c${steps}`, name: "read", args: {} }], stopReason: "stop" };
    };

    const result = await runSubagent(
      {
        definition: { name: "a", description: "d", systemPrompt: "s", maxTurns: 3, source: "builtin" },
        prompt: "go",
        workspace: "/tmp",
      },
      { tools, step: neverStops, ...HOST_BASE },
    );

    expect(result.steps).toBe(3);
  });

  it("withdraws tools on the last step it may take", async () => {
    // The main session stops offering tools on its final step so the model
    // answers with what it has. A subagent whose last step could still call
    // tools would run them and then stop before the model saw the results, so
    // the run would end mid-thought with narration standing in for an answer.
    const seen: boolean[] = [];
    const tools = new Map<string, AgentTool>([["read", tool("read", () => {})]]);
    const step: SubagentStep["step"] = async (_messages, _signal, options) => {
      seen.push(options.allowTools);
      return { text: "looking", toolCalls: [{ id: `c${seen.length}`, name: "read", args: {} }], stopReason: "stop" };
    };

    await runSubagent(
      {
        definition: { name: "a", description: "d", systemPrompt: "s", maxTurns: 3, source: "builtin" },
        prompt: "go",
        workspace: "/tmp",
      },
      { tools, step, ...HOST_BASE },
    );

    expect(seen).toEqual([true, true, false]);
  });

  it("reports a run that used every step without finishing as a failure", async () => {
    // Narration is not an answer. A caller that reads it as one acts on a
    // half-finished delegation believing it succeeded.
    const tools = new Map<string, AgentTool>([["read", tool("read", () => {})]]);
    let n = 0;
    const neverAnswers = async (): Promise<AssistantStep> => {
      n += 1;
      return { text: "still going", toolCalls: [{ id: `c${n}`, name: "read", args: {} }], stopReason: "stop" };
    };

    const result = await runSubagent(
      {
        definition: { name: "a", description: "d", systemPrompt: "s", maxTurns: 2, source: "builtin" },
        prompt: "go",
        workspace: "/tmp",
      },
      { tools, step: neverAnswers, ...HOST_BASE },
    );

    expect(result.failed).toBe(true);
    expect(result.failure).toContain("2");
  });

  it("does not call a run that answers on its last step a failure", async () => {
    // The budget ending and the run being cut off are different. A subagent
    // that answers with its final step did what was asked of it.
    const tools = new Map<string, AgentTool>([["read", tool("read", () => {})]]);
    let n = 0;
    const answersOnTheLastStep = async (): Promise<AssistantStep> => {
      n += 1;
      if (n < 2) {
        return { text: "looking", toolCalls: [{ id: "c1", name: "read", args: {} }], stopReason: "stop" };
      }
      return { text: "the answer", toolCalls: [], stopReason: "stop" };
    };

    const result = await runSubagent(
      {
        definition: { name: "a", description: "d", systemPrompt: "s", maxTurns: 2, source: "builtin" },
        prompt: "go",
        workspace: "/tmp",
      },
      { tools, step: answersOnTheLastStep, ...HOST_BASE },
    );

    expect(result.failed).toBe(false);
    expect(result.text).toContain("the answer");
  });

  it("reports a failure rather than a quiet empty answer", async () => {
    // A subagent whose model failed must not read as one that finished with
    // nothing to say.
    const failing = async (): Promise<AssistantStep> => ({
      text: "",
      toolCalls: [],
      stopReason: "error",
      errorMessage: "the provider refused",
    });

    const result = await runSubagent(
      { definition: { name: "a", description: "d", systemPrompt: "s", source: "builtin" }, prompt: "go", workspace: "/tmp" },
      { tools: new Map(), step: failing, ...HOST_BASE },
    );

    expect(result.failed).toBe(true);
    expect(result.failure).toContain("the provider refused");
  });

  it("tells the subagent what it may use and where it is working", async () => {
    // Saying the boundary out loud is part of it being real: a model that keeps
    // reaching for a tool it does not have spends steps discovering that.
    const seen: string[] = [];
    const capture = async (messages: readonly AgentMessage[]): Promise<AssistantStep> => {
      seen.push(String(messages[0]?.content ?? ""));
      return { text: "done", toolCalls: [], stopReason: "stop" };
    };

    await runSubagent(
      {
        definition: { name: "Explore", description: "d", systemPrompt: "You explore.", tools: ["read"], source: "builtin" },
        prompt: "go",
        workspace: "/work/here",
      },
      { tools: new Map([["read", tool("read", () => {})]]), step: capture, ...HOST_BASE },
    );

    const instruction = seen[0]!;
    expect(instruction).toContain("You explore.");
    expect(instruction).toContain("/work/here");
    expect(instruction).toContain("read");
  });

  it("runs with no tools when the definition asks for none", async () => {
    const capture = async (messages: readonly AgentMessage[]): Promise<AssistantStep> => ({
      text: String(messages[0]?.content ?? ""),
      toolCalls: [],
      stopReason: "stop",
    });

    const result = await runSubagent(
      { definition: { name: "a", description: "d", systemPrompt: "s", tools: [], source: "builtin" }, prompt: "go", workspace: "/tmp" },
      { tools: new Map([["read", tool("read", () => {})]]), step: capture, ...HOST_BASE },
    );

    expect(result.allowedTools).toEqual([]);
    expect(result.text).toContain("You have no tools");
  });
});


it("cannot recursively dispatch even when a definition and model both request task", async () => {
  let nested = 0;
  const result = await runSubagent({ definition: { name: "nested", description: "d", systemPrompt: "s", tools: ["task"], source: "builtin" },
    prompt: "dispatch", workspace: "/tmp" }, { tools: new Map([["task", tool("task", () => { nested++; })]]),
    step: stepThatCallsOnce("task"), defaultMaxSteps: 2 });
  expect(nested).toBe(0);
  expect(result.allowedTools).toEqual([]);
});


it("delivers the exact delegated task after its definition and attached context", async () => {
  const prompt = 'Review src/auth.ts only.\n保留原有行为。';
  let seen: readonly AgentMessage[] = [];
  await runSubagent({ definition: { name: "review", description: "short label", systemPrompt: "Review code.", source: "builtin" },
    prompt, workspace: "/work", context: "caller context", memory: "prior notes" }, {
    tools: new Map(), defaultMaxSteps: 2, step: async (messages) => {
      seen = [...messages];
      return { text: "done", toolCalls: [], stopReason: "stop" };
    },
  });
  expect(seen.at(-1)).toEqual({ role: "user", content: prompt });
  expect(seen[0]?.content).toContain("Review code.");
  expect(seen[0]?.content).toContain("caller context");
  expect(seen[0]?.content).toContain("prior notes");
});

it("does not ask the model to start an already aborted delegation", async () => {
  const controller = new AbortController();
  controller.abort();
  let called = false;
  const result = await runSubagent({ definition: { name: "a", description: "d", systemPrompt: "s", source: "builtin" },
    prompt: "go", workspace: "/work", signal: controller.signal }, {
    tools: new Map(), defaultMaxSteps: 2, step: async () => {
      called = true;
      return { text: "answer", toolCalls: [], stopReason: "stop" };
    },
  });
  expect(result).toMatchObject({ failed: true, steps: 0, failure: "the subagent was aborted" });
  expect(called).toBe(false);
});
