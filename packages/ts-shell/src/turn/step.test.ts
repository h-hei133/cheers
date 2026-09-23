import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStepFunction, CONTEXT_OVERFLOW_PREFIX, isContextOverflow } from "./step.js";
import { getSessionUsage, resetSessionUsage } from "../observability/usageTelemetry.js";
import { writeProjectState } from "../core/state/projectState.js";

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

  it("sends the sampling settings the caller configured", async () => {
    let body: { temperature?: number; top_p?: number; max_tokens?: number } = {};
    const step = createStepFunction({
      ...request,
      temperature: 0.2,
      topP: 0.9,
      maxOutputTokens: 777,
      fetchImpl: async (_url, init) => {
        body = JSON.parse(String(init?.body)) as typeof body;
        return jsonResponse({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] });
      },
    });
    await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: true });
    expect(body.temperature).toBe(0.2);
    expect(body.top_p).toBe(0.9);
    expect(body.max_tokens).toBe(777);
  });

  it("recognizes overflow markers regardless of provider casing", () => {
    expect(isContextOverflow("Maximum Context Length exceeded for model m")).toBe(true);
    expect(isContextOverflow("PROMPT_TOO_LONG: reduce input")).toBe(true);
    expect(isContextOverflow("context_length_exceeded")).toBe(true);
    expect(isContextOverflow("rate limited, try again later")).toBe(false);
  });

  it("reads cache traffic from the OpenAI-compatible shape", async () => {
    resetSessionUsage("sess_cache_openai");
    const step = createStepFunction({
      ...request,
      sessionId: "sess_cache_openai",
      fetchImpl: async () =>
        jsonResponse({
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          usage: {
            prompt_tokens: 1_000,
            completion_tokens: 10,
            prompt_tokens_details: { cached_tokens: 768 },
          },
        }),
    });

    await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: true });

    // Nested under `prompt_tokens_details` on this family of providers.
    expect(getSessionUsage("sess_cache_openai").cacheReadTokens).toBe(768);
    resetSessionUsage("sess_cache_openai");
  });

  it("reads cache traffic from the Anthropic-shaped fields", async () => {
    resetSessionUsage("sess_cache_anthropic");
    const step = createStepFunction({
      ...request,
      sessionId: "sess_cache_anthropic",
      fetchImpl: async () =>
        jsonResponse({
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          usage: {
            prompt_tokens: 1_000,
            completion_tokens: 10,
            cache_read_input_tokens: 512,
            cache_creation_input_tokens: 256,
          },
        }),
    });

    await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: true });

    const usage = getSessionUsage("sess_cache_anthropic");
    expect(usage.cacheReadTokens).toBe(512);
    expect(usage.cacheWriteTokens).toBe(256);
    resetSessionUsage("sess_cache_anthropic");
  });

  it("records no cache traffic when the provider reports none", async () => {
    resetSessionUsage("sess_cache_none");
    const step = createStepFunction({
      ...request,
      sessionId: "sess_cache_none",
      fetchImpl: async () =>
        jsonResponse({
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1_000, completion_tokens: 10 },
        }),
    });

    await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: true });

    const usage = getSessionUsage("sess_cache_none");
    expect(usage.cacheReadTokens).toBe(0);
    expect(usage.cacheWriteTokens).toBe(0);
    resetSessionUsage("sess_cache_none");
  });

  it("asks again after a transient refusal and keeps the successful answer", async () => {
    let calls = 0;
    const step = createStepFunction({
      ...request,
      retry: { enabled: true, maxRetries: 1, baseDelayMs: 1, maxDelayMs: 1 },
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) {
          return {
            ok: false,
            status: 503,
            headers: new Headers(),
            text: async () => "service unavailable",
          } as unknown as Response;
        }
        return jsonResponse({ choices: [{ message: { content: "recovered" }, finish_reason: "stop" }] });
      },
    });

    const result = await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: true });

    expect(calls).toBe(2);
    expect(result.stopReason).toBe("stop");
    expect(result.text).toBe("recovered");
  });

  it("stops at the configured count instead of asking forever", async () => {
    let calls = 0;
    const step = createStepFunction({
      ...request,
      retry: { enabled: true, maxRetries: 2, baseDelayMs: 1, maxDelayMs: 1 },
      fetchImpl: async () => {
        calls += 1;
        return {
          ok: false,
          status: 500,
          headers: new Headers(),
          text: async () => "server error",
        } as unknown as Response;
      },
    });

    const result = await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: true });

    // The first attempt plus two retries.
    expect(calls).toBe(3);
    expect(result.stopReason).toBe("error");
  });

  it("does not ask again when the request itself was rejected", async () => {
    let calls = 0;
    const step = createStepFunction({
      ...request,
      retry: { enabled: true, maxRetries: 3, baseDelayMs: 1, maxDelayMs: 1 },
      fetchImpl: async () => {
        calls += 1;
        return {
          ok: false,
          status: 400,
          headers: new Headers(),
          text: async () => "bad request",
        } as unknown as Response;
      },
    });

    const result = await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: true });

    expect(calls).toBe(1);
    expect(result.errorMessage).toContain("400");
  });

  it("waits the delay the server asked for", async () => {
    const started = Date.now();
    let calls = 0;
    const step = createStepFunction({
      ...request,
      retry: { enabled: true, maxRetries: 1, baseDelayMs: 10_000, maxDelayMs: 10_000 },
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) {
          return {
            ok: false,
            status: 429,
            headers: new Headers({ "retry-after": "0.05" }),
            text: async () => "rate limited",
          } as unknown as Response;
        }
        return jsonResponse({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] });
      },
    });

    await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: true });

    const elapsed = Date.now() - started;
    // The server said 50ms; the local backoff would have been ten seconds.
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(5_000);
  });

  it("does not retry an overflow, which is answered by condensing", async () => {
    let calls = 0;
    const step = createStepFunction({
      ...request,
      retry: { enabled: true, maxRetries: 3, baseDelayMs: 1, maxDelayMs: 1 },
      fetchImpl: async () => {
        calls += 1;
        return {
          ok: false,
          status: 400,
          headers: new Headers(),
          text: async () => JSON.stringify({ error: { code: "context_length_exceeded" } }),
        } as unknown as Response;
      },
    });

    const result = await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: true });

    expect(calls).toBe(1);
    expect(result.errorMessage?.startsWith(CONTEXT_OVERFLOW_PREFIX)).toBe(true);
  });

  it("shapes the request the way the catalog says this model wants it", async () => {
    // The catalog could describe a model's window and price but not how to talk
    // to it, so an endpoint that refuses `developer` or only accepts
    // `max_completion_tokens` failed on an otherwise correct request.
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "step-shape-"));
    try {
      writeProjectState(workspace, { thinkingEffort: "high" });
      let body: Record<string, unknown> = {};
      const step = createStepFunction({
        ...request,
        workspaceRoot: workspace,
        maxOutputTokens: 4096,
        catalog: [
          {
            id: "vendor",
            label: "Vendor",
            runtime: "openai-compatible",
            auth: "api-key",
            models: [
              {
                id: "m",
                contextWindow: 128_000,
                thinkingLevelMap: { high: "xhigh" },
                compat: {
                  systemRole: "developer",
                  maxTokensField: "max_completion_tokens",
                  assistantAfterToolResult: true,
                },
              },
            ],
          },
        ],
        fetchImpl: async (_url, init) => {
          body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
          return jsonResponse({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] });
        },
      });

      await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: true });

      const messages = body.messages as Array<{ role: string }>;
      expect(messages[0]?.role).toBe("developer");
      expect(body.max_completion_tokens).toBe(4096);
      expect(body.max_tokens).toBeUndefined();
      // The model's own name for the level, not the level's name.
      expect(body.reasoning_effort).toBe("xhigh");
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("bridges tool results when the model requires an assistant turn between them", async () => {
    let body: Record<string, unknown> = {};
    const step = createStepFunction({
      ...request,
      catalog: [
        {
          id: "vendor",
          label: "Vendor",
          runtime: "openai-compatible",
          auth: "api-key",
          models: [{ id: "m", contextWindow: 1_000, compat: { assistantAfterToolResult: true } }],
        },
      ],
      fetchImpl: async (_url, init) => {
        body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return jsonResponse({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] });
      },
    });

    await step(
      [
        {
          role: "assistant",
          content: "",
          tool_calls: [{ id: "c1", type: "function", function: { name: "read", arguments: "{}" } }],
        },
        { role: "tool", tool_call_id: "c1", content: "file!" },
        { role: "user", content: "and now?" },
      ] as never,
      undefined,
      {},
      { allowTools: true },
    );

    const roles = (body.messages as Array<{ role: string }>).map((message) => message.role);
    const toolIndex = roles.indexOf("tool");
    expect(roles[toolIndex + 1]).toBe("assistant");
    expect(roles[toolIndex + 2]).toBe("user");
  });

  it("keeps the request unchanged for a model the catalog does not describe", async () => {
    let body: Record<string, unknown> = {};
    const step = createStepFunction({
      ...request,
      maxOutputTokens: 2048,
      catalog: [],
      fetchImpl: async (_url, init) => {
        body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return jsonResponse({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] });
      },
    });

    await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: true });

    const messages = body.messages as Array<{ role: string }>;
    expect(messages[0]?.role).toBe("system");
    expect(body.max_tokens).toBe(2048);
    expect(body.max_completion_tokens).toBeUndefined();
  });

  it("still drops reasoning_effort when the host refuses it", async () => {
    // The refusal is not a transient failure, so it must not be retried with the
    // same field; the request is rebuilt without it instead. The level has to be
    // set for the field to be sent at all, so this runs in its own workspace.
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "step-effort-"));
    try {
      writeProjectState(workspace, { thinkingEffort: "high" });
      const bodies: string[] = [];
      const step = createStepFunction({
        ...request,
        workspaceRoot: workspace,
        retry: { enabled: true, maxRetries: 3, baseDelayMs: 1, maxDelayMs: 1 },
        fetchImpl: async (_url, init) => {
          bodies.push(String(init?.body ?? ""));
          if (bodies.length === 1) {
            return {
              ok: false,
              status: 400,
              headers: new Headers(),
              text: async () => "unsupported parameter: reasoning_effort",
            } as unknown as Response;
          }
          return jsonResponse({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] });
        },
      });

      const result = await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: true });

      expect(bodies).toHaveLength(2);
      expect(bodies[0]).toContain("reasoning_effort");
      expect(bodies[1]).not.toContain("reasoning_effort");
      expect(result.stopReason).toBe("stop");
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });
});
