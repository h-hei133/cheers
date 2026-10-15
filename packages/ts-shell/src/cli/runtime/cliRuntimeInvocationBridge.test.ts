import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { streamCliRuntimePrompt } from "./cliRuntimeInvocationBridge.js";
import { createGitRepoFixture } from "../../test-utils/cliHarness.js";

let scratch: string;
let workspaceRoot: string;
beforeEach(() => {
  const base = path.resolve(process.cwd(), "../../.tmp");
  fs.mkdirSync(base, { recursive: true });
  scratch = fs.mkdtempSync(path.join(base, "invocation-bridge-"));
  workspaceRoot = path.join(scratch, "workspace");
  const home = path.join(scratch, "home");
  createGitRepoFixture(workspaceRoot); fs.mkdirSync(home);
  vi.stubEnv("HOME", home); vi.stubEnv("USERPROFILE", home);
  vi.stubEnv("CHEERS_TEST_ROOT", path.join(scratch, "state"));
  vi.stubEnv("GIT_CEILING_DIRECTORIES", scratch);
});
afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(scratch, { recursive: true, force: true });
});

/** A synthetic run, which starts its turn without a readiness wait. */
function start(overrides: { readonly providerModeEnv?: string; readonly onPromptAccepted?: () => void } = {}) {
  return streamCliRuntimePrompt({
    prompt: "hello",
    onPromptAccepted: overrides.onPromptAccepted,
    sessionId: "sess_bridge",
    workspaceRoot,
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
  it("forwards admission to the kernel exactly once", async () => {
    let accepted = 0;
    const run = start({ onPromptAccepted: () => { accepted++; } });
    expect(accepted).toBe(0);
    for await (const _event of run.events) { /* drain the real synthetic turn */ }
    expect(accepted).toBe(1);
  });

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
