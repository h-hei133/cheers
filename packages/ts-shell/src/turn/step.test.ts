import { describe, expect, it } from "vitest";
import { createStepFunction, CONTEXT_OVERFLOW_PREFIX, isContextOverflow } from "./step.js";

/**
 * The step is the only place a provider is spoken to. What matters here is
 * what the kernel is told afterwards: an interruption is not a network
 * failure, an overflow is its own kind of failure, and a host that refuses a
 * request field costs one retry rather than the turn.
 */

const request = {
  provider: { apiKey: "k", baseUrl: "https://provider.test/v1", model: "m" },
  workspaceRoot: process.cwd(),
  sessionId: "sess_step",
  systemPrompt: "be brief",
  tools: [],
};

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("createStepFunction", () => {
  it("reports a cancelled request as an aborted step, not a network failure", async () => {
    const controller = new AbortController();
    const step = createStepFunction({
      ...request,
      fetchImpl: async () => {
        controller.abort();
        const error = new Error("This operation was aborted");
        error.name = "AbortError";
        throw error;
      },
    });
    const result = await step([{ role: "user", content: "hi" }], controller.signal, {}, { allowTools: true });
    expect(result.stopReason).toBe("aborted");
    expect(result.errorMessage).toBe("Operation aborted");
  });

  it("marks a context overflow so the session can compact and retry", async () => {
    const step = createStepFunction({
      ...request,
      fetchImpl: async () => jsonResponse({ error: { code: "context_length_exceeded" } }, { ok: false, status: 400 }),
    });
    const result = await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: true });
    expect(result.stopReason).toBe("error");
    expect(result.errorMessage?.startsWith(CONTEXT_OVERFLOW_PREFIX)).toBe(true);
  });

  it("delivers a whole-body answer as one delta and parses its tool calls", async () => {
    const deltas: string[] = [];
    const step = createStepFunction({
      ...request,
      fetchImpl: async () =>
        jsonResponse({
          choices: [
            {
              message: {
                content: "Reading.",
                tool_calls: [{ id: "c1", type: "function", function: { name: "read", arguments: "{\"path\":\"a\"}" } }],
              },
              finish_reason: "tool_calls",
            },
          ],
        }),
    });
    const result = await step([{ role: "user", content: "hi" }], undefined, { onText: (delta) => deltas.push(delta) }, { allowTools: true });
    expect(deltas).toEqual(["Reading."]);
    expect(result.toolCalls).toEqual([{ id: "c1", name: "read", args: { path: "a" } }]);
    expect(result.stopReason).toBe("stop");
  });

  it("flags a truncated response so the kernel refuses its tool calls", async () => {
    const step = createStepFunction({
      ...request,
      fetchImpl: async () =>
        jsonResponse({
          choices: [
            {
              message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "write", arguments: "{\"pa" } }] },
              finish_reason: "length",
            },
          ],
        }),
    });
    const result = await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: true });
    expect(result.stopReason).toBe("length");
    expect(result.toolCalls).toHaveLength(1);
  });

  it("forbids tools on the closing step", async () => {
    let body: { tool_choice?: string } = {};
    const step = createStepFunction({
      ...request,
      fetchImpl: async (_url, init) => {
        body = JSON.parse(String(init?.body)) as { tool_choice?: string };
        return jsonResponse({ choices: [{ message: { content: "final" }, finish_reason: "stop" }] });
      },
    });
    await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: false });
    expect(body.tool_choice).toBe("none");
  });

  it("explains an empty answer instead of inventing one", async () => {
    const step = createStepFunction({
      ...request,
      fetchImpl: async () => jsonResponse({ choices: [{ message: { content: "" }, finish_reason: "content_filter" }] }),
    });
    const result = await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: true });
    expect(result.text).toBe("");
    expect(result.errorMessage).toContain("withheld the reply");
    expect(result.stopReason).toBe("stop");
  });

  it("recognizes overflow markers regardless of provider casing", () => {
    expect(isContextOverflow("Maximum Context Length exceeded for model m")).toBe(true);
    expect(isContextOverflow("PROMPT_TOO_LONG: reduce input")).toBe(true);
    expect(isContextOverflow("context_length_exceeded")).toBe(true);
    expect(isContextOverflow("rate limited, try again later")).toBe(false);
  });
});
