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
    id: expect.stringMatching(/^synthetic-.+-1-read-1$/),
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

it("advances a bounded tool sequence one result at a time", async () => {
  const step = createSyntheticStep({
    toolIntent: [{
      phrase: "discover and fetch ",
      name: "tool_search",
      args: () => ({ query: "web_fetch" }),
      sequence: prompt => [
        { name: "tool_search", args: { query: "web_fetch" } },
        { name: "tool_load", args: { names: ["web_fetch"] } },
        { name: "web_fetch", args: { url: prompt.slice("discover and fetch ".length).trim() } },
      ],
    }],
  });
  const user = { role: "user", content: "discover and fetch http://127.0.0.1/fixture" } as AgentMessage;
  const first = await step([user], new AbortController().signal, { onText: () => undefined });
  expect(first.toolCalls[0]).toMatchObject({
    id: expect.stringMatching(/^synthetic-.+-1-tool_search-1$/),
    name: "tool_search",
    args: { query: "web_fetch" },
  });

  const afterSearch = [
    user,
    { role: "assistant", content: "", tool_calls: persistedCalls(first.toolCalls) },
    { role: "tool", content: "found web_fetch", tool_call_id: first.toolCalls[0].id },
  ] as AgentMessage[];
  const second = await step(afterSearch, new AbortController().signal, { onText: () => undefined });
  expect(second.toolCalls[0]).toMatchObject({
    id: expect.stringMatching(/^synthetic-.+-1-tool_load-2$/),
    name: "tool_load",
    args: { names: ["web_fetch"] },
  });

  const afterLoad = [
    ...afterSearch,
    { role: "assistant", content: "", tool_calls: persistedCalls(second.toolCalls) },
    { role: "tool", content: "loaded web_fetch", tool_call_id: second.toolCalls[0].id },
  ] as AgentMessage[];
  const third = await step(afterLoad, new AbortController().signal, { onText: () => undefined });
  expect(third.toolCalls[0]).toMatchObject({
    id: expect.stringMatching(/^synthetic-.+-1-web_fetch-3$/),
    name: "web_fetch",
    args: { url: "http://127.0.0.1/fixture" },
  });

  const afterFetch = [
    ...afterLoad,
    { role: "assistant", content: "", tool_calls: persistedCalls(third.toolCalls) },
    { role: "tool", content: "fixture body", tool_call_id: third.toolCalls[0].id },
  ] as AgentMessage[];
  const complete = await step(afterFetch, new AbortController().signal, { onText: () => undefined });
  expect(complete.toolCalls).toEqual([]);
  expect(complete.text).toBe("Synthetic reply: discover and fetch http://127.0.0.1/fixture");
});

it("does not repeat the same planned call before its tool result arrives", async () => {
  const step = createSyntheticStep({
    toolIntent: [{
      phrase: "discover and fetch ",
      name: "tool_search",
      args: () => ({ query: "web_fetch" }),
      sequence: () => [
        { name: "tool_search", args: { query: "web_fetch" } },
        { name: "tool_load", args: { names: ["web_fetch"] } },
      ],
    }],
  });
  const user = { role: "user", content: "discover and fetch http://127.0.0.1/fixture" } as AgentMessage;
  const first = await step([user], new AbortController().signal, { onText: () => undefined });
  const repeated = await step([
    user,
    { role: "assistant", content: "", tool_calls: persistedCalls(first.toolCalls) },
  ] as AgentMessage[], new AbortController().signal, { onText: () => undefined });
  expect(repeated.toolCalls).toEqual([]);
  const resumed = await createSyntheticStep({ toolIntent: [{ phrase: "discover and fetch ", name: "tool_search", args: () => ({}) }] })([
    user, { role: "assistant", content: "", tool_calls: persistedCalls(first.toolCalls) },
  ], new AbortController().signal, {});
  expect(resumed.toolCalls).toEqual([]);
});

it("never reuses a tool call identity across user turns or resumed step instances", async () => {
  const options = { toolIntent: [{ phrase: "run ", name: "bash", args: () => ({ command: "true" }) }] };
  const step = createSyntheticStep(options);
  const user = { role: "user", content: "run true" } as AgentMessage;
  const signal = new AbortController().signal;
  const first = await step([user], signal, {});
  const retried = await step([user], signal, {});
  expect(retried.toolCalls[0].id).toBe(first.toolCalls[0].id);
  const resumed = await createSyntheticStep(options)([user], signal, {});
  expect(resumed.toolCalls[0].id).not.toBe(first.toolCalls[0].id);
  const second = await step([user, { role: "assistant", content: "", tool_calls: persistedCalls(first.toolCalls) },
    { role: "tool", content: "done", tool_call_id: first.toolCalls[0].id }, user], signal, {});
  expect(second.toolCalls[0].id).not.toBe(first.toolCalls[0].id);
});

function persistedCalls(calls: readonly import('../core/agent/tools.js').AgentToolCall[]) {
  return calls.map(call => ({ id: call.id, type: 'function' as const,
    function: { name: call.name, arguments: JSON.stringify(call.args) } }));
}

it("does not advance a plan from an unrelated tool result", async () => {
  const step = createSyntheticStep({ toolIntent: [{ phrase: "run ", name: "bash", args: () => ({ command: "true" }) }] });
  const result = await step([{ role: "user", content: "run true" },
    { role: "tool", content: "unrelated result", tool_call_id: "unrelated" }], new AbortController().signal, {});
  expect(result.toolCalls[0]).toMatchObject({ name: "bash" });
});
