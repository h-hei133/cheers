import { describe, expect, it } from "vitest";
import { runBrainstormCommand } from "./brainstormCommandRuntime.js";

const CONTEXT = { cwd: "/work/project" };

async function run(...args: string[]): Promise<{ kind: string; text: string }> {
  const result = await runBrainstormCommand(args, CONTEXT);
  const text = result.kind === "prompt" ? result.prompt : result.kind === "local" ? result.output : "";
  return { kind: result.kind, text };
}

describe("brainstorming a specific problem", () => {
  it("carries the problem into the prompt instead of answering from a template", async () => {
    const { kind, text } = await run("multi-tenant", "rate", "limiter", "with", "a", "sliding", "window");

    expect(kind).toBe("prompt");
    expect(text).toContain("multi-tenant rate limiter with a sliding window");
  });

  it("produces a different prompt for a different problem, which the old one did not", async () => {
    const first = await run("in-memory", "cache", "with", "eviction");
    const second = await run("websocket", "pool", "with", "reconnection", "backoff");

    expect(first.text).not.toBe(second.text);
  });

  it("asks for questions and no solution in elicitation mode", async () => {
    const { text } = await run("-i", "background", "job", "retries");

    expect(text).toContain("background job retries");
    expect(text).toMatch(/do not propose a solution/i);
    expect(text).toMatch(/needs a decision/i);
  });

  it("proposes rather than asks in the default mode", async () => {
    const { text } = await run("background", "job", "retries");

    expect(text).toMatch(/pick one/i);
    expect(text).not.toMatch(/stop after the questions/i);
  });

  it("requires the write to have succeeded before the path is claimed", async () => {
    const { text } = await run("-s", "queue", "draining");

    expect(text).toContain("docs/specs/queue-draining-design.md");
    expect(text).toMatch(/only after the write tool has reported success/i);
  });

  it("keeps the saved file name usable when the problem is all punctuation", async () => {
    const { text } = await run("-s", "???");

    expect(text).toContain("docs/specs/design-design.md");
  });

  it("asks for approaches that differ in kind, not one restated", async () => {
    const { text } = await run("cache", "invalidation");

    expect(text).toMatch(/differ in kind/i);
    expect(text).toMatch(/change your mind/i);
  });

  it("explains itself when given nothing to explore", async () => {
    const { kind, text } = await run();

    expect(kind).toBe("local");
    expect(text).toContain("/brainstorm <problem>");
  });
});
