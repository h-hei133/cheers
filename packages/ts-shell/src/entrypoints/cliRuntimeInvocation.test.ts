import { describe, expect, it } from "vitest";
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
  it("packages provider mode from the existing CLI environment convention", () => {
    expect(buildCliRuntimeInvocation(baseInput({ providerModeEnv: "synthetic" })).providerMode).toBe("synthetic");
    expect(buildCliRuntimeInvocation(baseInput({ providerModeEnv: "real" })).providerMode).toBe("real");
    expect(buildCliRuntimeInvocation(baseInput({ providerModeEnv: undefined })).providerMode).toBe("real");
  });

  it("drives a synthetic prompt through the turn without touching the provider", async () => {
    const { deps, calls } = dependencies();
    const recorded: string[] = [];
    const events = await collect(
      runCliRuntimeInvocation(
        baseInput({
          providerModeEnv: "synthetic",
          prompt: "hello there",
          onTurnMessage: (message) => recorded.push(`${message.role}:${message.content}`),
        }),
        deps,
      ).events,
    );

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
    const events = await collect(runCliRuntimeInvocation(baseInput({ providerModeEnv: "real" }), deps).events);

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
    const events = await collect(
      runCliRuntimeInvocation(baseInput({ providerModeEnv: "real", prompt: "write a file" }), failingDeps).events,
    );

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
    const run = runCliRuntimeInvocation(baseInput({ providerModeEnv: "real", prompt: "first" }), slowDeps);
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
});
