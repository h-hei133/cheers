import { expect, it } from "vitest";
import type { AgentMessage } from "../core/agent/state.js";
import { createSyntheticStep } from "./synthetic.js";

it("finds a tool request after runtime-owned continuity context", async () => {
  const step = createSyntheticStep({
    toolIntent: [{
      phrase: "read the first line from ",
      name: "read",
      args: prompt => ({ path: prompt.slice("read the first line from ".length).trim(), limit: 1 }),
    }],
  });
  const messages = [{
    role: "user",
    content: [
      "[Environment Context: cwd=/workspace]",
      "",
      "Recorded session facts (historical context, not current authorization):",
      "Session continuity context:",
      "- last-terminal: success",
      "- instruction: use this continuity context to continue the same task; do not restart from scratch.",
      "",
      "read the first line from fixture.txt",
    ].join("\n"),
  }] as AgentMessage[];

  const result = await step(messages, new AbortController().signal, { onText: () => undefined });
  expect(result.toolCalls).toEqual([{
    id: "synthetic-read",
    name: "read",
    args: { path: "fixture.txt", limit: 1 },
  }]);
});

it("does not suppress a new request because an earlier turn used a tool", async () => {
  const step = createSyntheticStep({
    toolIntent: [{ phrase: "run ", name: "bash", args: prompt => ({ command: prompt.slice(4).trim() }) }],
  });
  const messages = [
    { role: "user", content: "old request" },
    { role: "tool", content: "old result" },
    { role: "user", content: "run node --version" },
  ] as AgentMessage[];
  const result = await step(messages, new AbortController().signal, { onText: () => undefined });
  expect(result.toolCalls[0]).toMatchObject({ name: "bash", args: { command: "node --version" } });
});
