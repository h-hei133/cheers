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

function baseInput(
  overrides: Partial<CliRuntimeInvocationInput> = {},
): CliRuntimeInvocationInput {
  return {
    sessionId: "sess_123",
    prompt: "write a file",
    workspaceRoot: "/workspace",
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
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

function event(delta: string): QueryEvent {
  return { type: "message.delta", role: "assistant", delta };
}

async function* oneEvent(delta: string): AsyncIterable<QueryEvent> {
  yield event(delta);
}

function dependencies(): {
  deps: CliRuntimeInvocationDependencies;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      streamIntegratedFlow: (input) => {
        calls.push(
          `integrated:${input.providerMode}:${input.applyPatchRuntimeRoute ? "patch" : "default"}:${input.planningMutationExecution ? "planning-mutation" : "no-planning-mutation"}`,
        );
        return oneEvent("integrated");
      },
      streamLightweight: (input) => {
        calls.push(`lightweight:${input.providerMode}:${input.mode}`);
        return oneEvent("lightweight");
      },
      checkProviderReadiness: async () => {
        calls.push("readiness");
        return { ok: true };
      },
      createReadinessTerminalEvent: (input) => {
        calls.push(`readiness-event:${input.stopReason}`);
        return event("readiness-event");
      },
    },
  };
}

describe("CLI runtime invocation", () => {
  it("packages provider mode from the existing CLI environment convention", () => {
    expect(
      buildCliRuntimeInvocation(
        baseInput({ providerModeEnv: "synthetic" }),
      ).providerMode,
    ).toBe("synthetic");
    expect(
      buildCliRuntimeInvocation(baseInput({ providerModeEnv: "real" }))
        .providerMode,
    ).toBe("real");
    expect(
      buildCliRuntimeInvocation(baseInput({ providerModeEnv: undefined }))
        .providerMode,
    ).toBe("real");
  });

  it("keeps explicit apply_patch runtime route on the integrated flow path", async () => {
    const { deps, calls } = dependencies();
    const events = await collect(
      runCliRuntimeInvocation(
        baseInput({
          providerModeEnv: "synthetic",
          applyPatchRuntimeRoute: {
            explicitRuntimeOptIn: true,
            requestedUserDecision: "approved",
            runtimeSource: "production-adjacent",
          },
        }),
        deps,
      ).events,
    );

    expect(events).toEqual([event("integrated")]);
    expect(calls).toEqual(["integrated:synthetic:patch:no-planning-mutation"]);
  });

  it("routes exact fenced replacement prompts through the integrated CLI path", async () => {
    const { deps, calls } = dependencies();
    const events = await collect(
      runCliRuntimeInvocation(
        baseInput({
          providerModeEnv: "synthetic",
          prompt: [
            "Replace the exact fenced block in src/app.ts",
            "```",
            "status: draft",
            "```",
            "with",
            "```",
            "status: ready",
            "```",
          ].join("\n"),
          agentMode: "build",
        }),
        deps,
      ).events,
    );

    expect(events).toEqual([event("integrated")]);
    expect(calls).toEqual(["integrated:synthetic:default:no-planning-mutation"]);
  });

  it("passes explicit planning mutation execution contract to integrated flow", async () => {
    const { deps, calls } = dependencies();
    const events = await collect(
      runCliRuntimeInvocation(
        baseInput({
          providerModeEnv: "synthetic",
          prompt: "Fix planner ranking",
          planningMutationExecution: {
            confirmation: { state: "trusted-confirmed" },
            rawProposal: {
              operationKind: "exact-fenced-replacement",
              targets: [
                {
                  path: "src/app.ts",
                  oldText: "old",
                  newText: "new",
                },
              ],
            },
            controlledWorkspace: {
              scope: "controlled-temp-workspace",
              source: "cli-flag",
            },
          },
        }),
        deps,
      ).events,
    );

    expect(events).toEqual([event("integrated")]);
    expect(calls).toEqual(["integrated:synthetic:default:planning-mutation"]);
  });

  it("routes lightweight prompts through the existing lightweight provider path", async () => {
    const { deps, calls } = dependencies();
    const events = await collect(
      runCliRuntimeInvocation(
        baseInput({
          providerModeEnv: "synthetic",
          prompt: "hello there",
          agentMode: "build",
        }),
        deps,
      ).events,
    );

    expect(events).toEqual([event("lightweight")]);
    expect(calls).toEqual(["lightweight:synthetic:chat"]);
  });

  it("preserves real-provider readiness stop before integrated runtime", async () => {
    const { deps, calls } = dependencies();
    const failingDeps: CliRuntimeInvocationDependencies = {
      ...deps,
      checkProviderReadiness: async () => {
        calls.push("readiness");
        return {
          ok: false,
          failure: {
            kind: "missing-key",
            stopReason: "missing provider key",
          },
        };
      },
    };
    const events = await collect(
      runCliRuntimeInvocation(
        baseInput({
          providerModeEnv: "real",
          prompt: "write a file",
        }),
        failingDeps,
      ).events,
    );

    expect(events).toEqual([event("readiness-event")]);
    expect(calls).toEqual(["readiness", "readiness-event:missing provider key"]);
  });
});
