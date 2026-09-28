import { describe, expect, it } from "vitest";

import { streamCliRuntimePrompt } from "./cliRuntimeInvocationBridge.js";

/** A synthetic run, which starts its turn without a readiness wait. */
function start(overrides: { readonly providerModeEnv?: string } = {}) {
  return streamCliRuntimePrompt({
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
      providerModeEnv: () => overrides.providerModeEnv ?? "synthetic",
      realProviderSmokeOptIn: () => false,
    },
  });
}

describe("CLI runtime invocation bridge", () => {
  it("packages provider mode from the provider bridge and returns an input handle", async () => {
    const result = start();
    expect(typeof result.input?.steer).toBe("function");
    const types: string[] = [];
    for await (const event of result.events) types.push(event.type);
    expect(types[0]).toBe("query.started");
    expect(types.at(-1)).toBe("query.completed");
  });

  it("adopts the run's own queue, so held input is not stranded outside it", async () => {
    // The handle is a shell over the run's: text given before the run exists is
    // buffered, and once the run exists the queue reported and drained has to be
    // the run's. Answering from the local buffer alone reported an empty queue
    // while the run held the message, and left typed text unrecoverable when the
    // user interrupted the turn.
    //
    // A follow-up is used because the turn holds it until the current work stops,
    // so it is still queued when this reads — no timing assumption about when the
    // turn consumes a steering message.
    const run = start();
    run.input!.followUp("queued before the run existed");
    const events = run.events[Symbol.asyncIterator]();
    // The first event is yielded only after `startTurn` resolved, which is what
    // adoption waits on: reading the queue after this cannot race it.
    await events.next();

    expect(run.input!.pending().followUps).toContain("queued before the run existed");
    expect(run.input!.clearQueue()).toContain("queued before the run existed");
    expect(run.input!.pending().followUps).toEqual([]);

    for (;;) {
      const next = await events.next();
      if (next.done) break;
    }
  });
});
