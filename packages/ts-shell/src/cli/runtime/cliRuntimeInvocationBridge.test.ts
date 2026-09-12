import { describe, expect, it } from "vitest";

import { streamCliRuntimePrompt } from "./cliRuntimeInvocationBridge.js";

describe("CLI runtime invocation bridge", () => {
  it("packages provider mode from the provider bridge and returns an input handle", async () => {
    const result = streamCliRuntimePrompt({
      prompt: "hello",
      sessionId: "sess_bridge",
      workspaceRoot: process.cwd(),
      signal: new AbortController().signal,
      maxTurns: 1,
      escalationPromptHandler: async (prompt) => ({ promptId: prompt.id, decision: "deny", respondedAt: 1 }),
      providerCredentialResolution: { provider: "openai", expectedEnvVarName: "OPENAI_API_KEY" },
      agentMode: "build",
      providerRuntimeBridge: {
        resolveCredentialSnapshot: () => ({ provider: "openai", expectedEnvVarName: "OPENAI_API_KEY" }),
        providerModeEnv: () => "synthetic",
        realProviderSmokeOptIn: () => false,
      },
    });
    expect(typeof result.input?.steer).toBe("function");
    const types: string[] = [];
    for await (const event of result.events) types.push(event.type);
    expect(types[0]).toBe("query.started");
    expect(types.at(-1)).toBe("query.completed");
  });
});
