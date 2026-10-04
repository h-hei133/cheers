import { describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { recordSessionUsage, resetSessionUsage } from "../observability/usageTelemetry.js";
import { createTaskToolDefinition } from "../core/tools/taskTool.js";
import type { QueryEvent } from "../core/query/runtime/events.js";
import type { ProviderCredentialResolution } from "../core/shell/providerCredentials.js";
import {
  buildCliRuntimeInvocation,
  runCliRuntimeInvocation,
  type CliRuntimeInvocationDependencies,
  type CliRuntimeInvocationInput,
} from "./cliRuntimeInvocation.js";

const providerCredentialResolution: ProviderCredentialResolution = {
  provider: "openai",
  expectedEnvVarName: "OPENAI_API_KEY",
  credential: {
    provider: "openai",
    authMode: "api-key",
    apiKey: "test-key",
    source: "cli",
    envVarName: "OPENAI_API_KEY",
  },
};

function baseInput(overrides: Partial<CliRuntimeInvocationInput> = {}): CliRuntimeInvocationInput {
  return {
    sessionId: "sess_123",
    prompt: "write a file",
    workspaceRoot: process.cwd(),
    signal: new AbortController().signal,
    maxTurns: 3,
    escalationPromptHandler: async (prompt) => ({
      promptId: prompt.id,
      decision: "deny",
      respondedAt: 1,
      userComment: "test",
    }),
    providerCredentialResolution,
    agentMode: "build",
    ...overrides,
  };
}

async function collect(events: AsyncIterable<QueryEvent>): Promise<QueryEvent[]> {
  const collected: QueryEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
}

function event(delta: string): QueryEvent {
  return { type: "message.delta", role: "coder", delta };
}

function dependencies(): { deps: CliRuntimeInvocationDependencies; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      checkProviderReadiness: async () => {
        calls.push("readiness");
        return { ok: true };
      },
      createReadinessTerminalEvent: (input) => {
        calls.push(`readiness-event:${input.stopReason}`);
        return event("readiness-event");
      },
      createStep: () => {
        calls.push("step");
        return async (_messages, _signal, listener) => {
          listener.onText?.("real answer");
          return { text: "real answer", toolCalls: [], stopReason: "stop" };
        };
      },
      tools: () => new Map(),
    },
  };
}

describe("CLI runtime invocation", () => {
  it("delivers captured requests and settlement to the warming runner", async () => {
    const cacheWarming = { noteRequest: vi.fn(), noteSettled: vi.fn(), stop: vi.fn(), status: () => ({ mode: "idle" as const }) };
    const sent = { url: "https://local.test", headers: {}, body: "{}" };
    resetSessionUsage("sess_123");
    const run = await runCliRuntimeInvocation(baseInput({ cacheWarming }), {
      ...dependencies().deps,
      createStep: () => async (_messages, _signal, _listener, options) => {
        options.onRequestSent?.(sent);
        recordSessionUsage("sess_123", { promptTokens: 100, model: "fixture" });
        options.onRequestUsage?.({ prompt_tokens: 100 });
        return { text: "done", toolCalls: [], stopReason: "stop" };
      },
    });
    await collect(run.events);
    expect(cacheWarming.noteRequest).toHaveBeenCalledWith(100, sent);
    expect(cacheWarming.noteSettled).toHaveBeenCalledOnce();
    resetSessionUsage("sess_123");
  });

  it.each([false, true])("carries historical continuity without changing user intent or persisted turns (image=%s)", async (withImage) => {
    const { deps } = dependencies();
    const recorded: unknown[] = [];
    const observed: string[] = [];
    const image = { type: "image" as const, data: "aGVsbG8=", mimeType: "image/png" };
    const prompt = "Continue and inspect the previous target";
    const context = "Session continuity context:\n- last-write-effect: unknown\n- last-write-requires-user-inspection: yes";
    const run = await runCliRuntimeInvocation(baseInput({
      prompt, continuityContext: context, onTurnMessage: (message) => recorded.push(message),
      ...(withImage ? { attachments: { images: [image] } } : {}),
    }), {
      ...deps,
      createStep: () => async (messages) => {
        observed.push(JSON.stringify(messages));
        if (withImage) expect(messages.at(-1)?.content).toContainEqual(image);
        else expect(typeof messages.at(-1)?.content).toBe("string");
        return { text: "ready to inspect", toolCalls: [], stopReason: "stop" };
      },
    });
    const events = await collect(run.events);
    expect(observed[0]).toContain("last-write-effect: unknown");
    expect(observed[0]).toContain("last-write-requires-user-inspection: yes");
    expect(observed[0]).toContain(prompt);
    expect(observed[0].match(/Session continuity context:/g)).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "query.started", prompt });
    expect(recorded).toEqual([{ role: "assistant", content: "ready to inspect" }]);
  });

  it("rebuilds delegated system mode and tools through the production step factory", async () => {
    const bodies: Array<{ messages: Array<{ role: string; content: string }> }> = [];
    const server = createServer(async (request, response) => {
      let body = "";
      for await (const chunk of request) body += chunk;
      bodies.push(JSON.parse(body));
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: bodies.length === 1 ? {
        content: "delegate", tool_calls: [{ id: "dispatch", type: "function", function: { name: "task", arguments: JSON.stringify({
          description: "review", prompt: "inspect", subagent_type: "code-reviewer",
        }) } }],
      } : { content: "done" }, finish_reason: "stop" }] }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No test HTTP port");
      const { createStep: _createStep, ...deps } = dependencies().deps;
      const run = await runCliRuntimeInvocation(baseInput({ permissionScope: "allow-all", providerModeEnv: "real",
        providerCredentialResolution: { ...providerCredentialResolution, baseUrl: `http://127.0.0.1:${address.port}/v1`, model: "test" },
      }), { ...deps, tools: () => new Map([
        ["task", createTaskToolDefinition()],
        ["read", { name: "read", description: "read", argsSchema: {}, execute: async () => ({ success: true, output: "contents" }) }],
      ]) });
      await collect(run.events);
      const systems = bodies.map((body) => body.messages.find((message) => message.role === "system")?.content);
      expect(systems).toHaveLength(3);
      expect(systems[0]).toContain("BUILD MODE ACTIVE");
      expect(systems[1]).toContain("PLAN MODE ACTIVE");
      expect(systems[1]).not.toContain("BUILD MODE ACTIVE");
      expect(systems[1]).toContain("real tools (read)");
      expect(systems[2]).toBe(systems[0]);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("packages provider mode from the existing CLI environment convention", () => {
    expect(buildCliRuntimeInvocation(baseInput({ providerModeEnv: "synthetic" })).providerMode).toBe("synthetic");
    expect(buildCliRuntimeInvocation(baseInput({ providerModeEnv: "real" })).providerMode).toBe("real");
    expect(buildCliRuntimeInvocation(baseInput({ providerModeEnv: undefined })).providerMode).toBe("real");
  });

  it("drives a synthetic prompt through the turn without touching the provider", async () => {
    const { deps, calls } = dependencies();
    const recorded: string[] = [];
    const events = await collect((await runCliRuntimeInvocation(
      baseInput({
        providerModeEnv: "synthetic",
        prompt: "hello there",
        onTurnMessage: (message) => recorded.push(`${message.role}:${message.content}`),
      }),
      deps,
    )).events);

    expect(calls).toEqual([]);
    expect(events[0]).toEqual({ type: "query.started", sessionId: "sess_123", prompt: "hello there" });
    const deltas = events.filter((entry) => entry.type === "message.delta").map((entry) => (entry as { delta: string }).delta);
    expect(deltas.join("")).toBe("Synthetic reply: hello there");
    const terminal = events.at(-1);
    expect(terminal?.type).toBe("query.completed");
    if (terminal?.type === "query.completed") {
      expect(terminal.result.finalOutput).toBe("Synthetic reply: hello there");
      expect(terminal.result.terminalClassification).toBe("success");
    }
    expect(recorded).toEqual(["assistant:Synthetic reply: hello there"]);
  });

  it("checks real-provider readiness before the model is asked anything", async () => {
    const { deps, calls } = dependencies();
    const events = await collect((await runCliRuntimeInvocation(baseInput({ providerModeEnv: "real" }), deps)).events);

    expect(calls).toEqual(["readiness", "step"]);
    expect(events.at(-1)?.type).toBe("query.completed");
    expect(events.some((entry) => entry.type === "message.delta" && entry.delta === "real answer")).toBe(true);
  });

  it("preserves real-provider readiness stop before the turn starts", async () => {
    const { deps, calls } = dependencies();
    const failingDeps: CliRuntimeInvocationDependencies = {
      ...deps,
      checkProviderReadiness: async () => {
        calls.push("readiness");
        return { ok: false, failure: { kind: "missing-key", stopReason: "missing provider key" } };
      },
    };
    const events = await collect((await runCliRuntimeInvocation(baseInput({ providerModeEnv: "real", prompt: "write a file" }), failingDeps)).events);

    expect(events).toEqual([event("readiness-event")]);
    expect(calls).toEqual(["readiness", "readiness-event:missing provider key"]);
  });

  it("hands back an input handle that reaches the run once it has started", async () => {
    const { deps } = dependencies();
    const gate = { release: (): void => {} };
    const slowDeps: CliRuntimeInvocationDependencies = {
      ...deps,
      createStep: () => async (messages, _signal, listener) => {
        const lastUser = [...messages].reverse().find((message) => message.role === "user");
        if (!lastUser?.content.includes("steered")) await new Promise<void>((resolve) => { gate.release = resolve; });
        const text = `saw ${lastUser?.content ?? ""}`;
        listener.onText?.(text);
        return { text, toolCalls: [], stopReason: "stop" };
      },
    };
    const run = await runCliRuntimeInvocation(baseInput({ providerModeEnv: "real", prompt: "first" }), slowDeps);
    const collected: QueryEvent[] = [];
    const reading = (async () => {
      for await (const entry of run.events) {
        collected.push(entry);
        if (entry.type === "query.started") {
          await new Promise((resolve) => setTimeout(resolve, 0));
          run.input?.followUp("steered later");
          expect(run.input?.pending().followUps).toEqual(["steered later"]);
          gate.release();
        }
      }
    })();
    await reading;
    const deltas = collected.filter((entry) => entry.type === "message.delta").map((entry) => (entry as { delta: string }).delta);
    expect(deltas.some((delta) => delta.includes("steered later"))).toBe(true);
    expect(run.input?.pending().followUps).toEqual([]);
  });

  it("buffers input handed over before the readiness check finishes", async () => {
    const { deps } = dependencies();
    let releaseReadiness!: () => void;
    const readinessGate = new Promise<void>((resolve) => {
      releaseReadiness = resolve;
    });
    const gatedDeps: CliRuntimeInvocationDependencies = {
      ...deps,
      checkProviderReadiness: async () => {
        await readinessGate;
        return { ok: true };
      },
    };
    const run = await runCliRuntimeInvocation(baseInput({ providerModeEnv: "real", prompt: "first" }), gatedDeps);
    run.input?.steer("early steer");
    run.input?.followUp("early follow-up");
    expect(run.input?.pending()).toEqual({ steering: ["early steer"], followUps: ["early follow-up"] });
    const reading = collect(run.events);
    releaseReadiness();
    const events = await reading;
    expect(events.at(-1)?.type).toBe("query.completed");
    expect(run.input?.pending()).toEqual({ steering: [], followUps: [] });
  });
});
