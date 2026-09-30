import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStepFunction, emptyAnswerExplanation, CONTEXT_OVERFLOW_PREFIX, isContextOverflow } from "./step.js";
import { getSessionUsage, resetSessionUsage } from "../observability/usageTelemetry.js";
import { writeProjectState } from "../core/state/projectState.js";
import { declareEndpoint } from "../provider/endpoints/index.js";
import { runAgentLoop } from "../core/agent/loop.js";

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
  it.each(["content", "reasoning_content"])("does not retry partial %s at the outer loop", async (channel) => {
    let requests = 0;
    const shown: string[] = [];
    const step = createStepFunction({ ...request, fetchImpl: async () => {
      requests++;
      return new Response(new ReadableStream<Uint8Array>({ start(controller) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { [channel]: "already seen" } }] })}\n\n`));
        setTimeout(() => controller.error(new Error("connection lost")), 5);
      } }), { headers: { "content-type": "text/event-stream" } });
    } });
    const produced = await runAgentLoop([{ role: "user", content: "hello" }], [], {
      retry: { maxRetries: 2, baseDelayMs: 0, maxDelayMs: 0 },
      streamStep: (messages, signal) => step(messages, signal, {
        onText: (text) => shown.push(text), onReasoning: (text) => shown.push(text),
      }, { allowTools: true }),
    }, () => {}, undefined);
    expect(requests).toBe(1);
    expect(shown).toEqual(["already seen"]);
    expect(produced.at(-1)?.stopReason).toBe("error");
  });

  it("marks returned error completions after visible output as non-retryable", async () => {
    const step = createStepFunction({ ...request, fetchImpl: async () => jsonResponse({
      choices: [{ message: { content: "partial answer" }, finish_reason: "error" }],
    }) });
    const result = await step([], undefined, {}, { allowTools: true });
    expect(result).toMatchObject({ text: "partial answer", stopReason: "error", retriesExhausted: true });
  });

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

  it("reports the request it sent, as it sent it", async () => {
    // This is what a cache refresh replays. It has to be the bytes that went
    // out, because a cache is keyed on the request's own prefix: anything
    // rebuilt from the session's history — without the system instruction,
    // without the microcompaction of old turns — would arrive as a miss and be
    // charged at the full write price.
    const sent: Array<{ url: string; body: string }> = [];
    let receivedUrl = "";
    let receivedBody = "";
    const step = createStepFunction({
      ...request,
      fetchImpl: async (url: string | URL, init?: RequestInit) => {
        receivedUrl = String(url);
        receivedBody = String(init?.body ?? "");
        return jsonResponse({ choices: [{ message: { content: "ok" } }] });
      },
    });

    await step(
      [{ role: "user", content: "hi" }],
      undefined,
      {},
      { allowTools: true, onRequestSent: (captured) => sent.push(captured) },
    );

    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(receivedUrl);
    expect(sent[0].body).toBe(receivedBody);
    // The system instruction is part of the cached prefix, so it must be in
    // what was captured.
    expect(JSON.parse(sent[0].body).messages[0]).toEqual({ role: "system", content: "be brief" });
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

  it("names the model every kind of step came from", async () => {
    // Every exit — an answer, a refusal the retries gave up on, an overflow —
    // must say which model produced it. A step that forgets leaves a failure
    // the next run cannot attribute, and attribution is the fact the origin
    // field exists to carry.
    const answered = createStepFunction({
      ...request,
      fetchImpl: async () => jsonResponse({ choices: [{ message: { content: "hi" }, finish_reason: "stop" }] }),
    });
    const answer = await answered([{ role: "user", content: "q" }], undefined, {}, { allowTools: true });
    expect(answer.origin).toEqual({ model: "m" });

    const refused = createStepFunction({
      ...request,
      fetchImpl: async () => jsonResponse({ error: "no" }, { ok: false, status: 400 }),
    });
    const refusal = await refused([{ role: "user", content: "q" }], undefined, {}, { allowTools: true });
    expect(refusal.stopReason).toBe("error");
    expect(refusal.origin).toEqual({ model: "m" });

    const overflowed = createStepFunction({
      ...request,
      fetchImpl: async () => jsonResponse({ error: { code: "context_length_exceeded" } }, { ok: false, status: 400 }),
    });
    const overflow = await overflowed([{ role: "user", content: "q" }], undefined, {}, { allowTools: true });
    expect(overflow.origin).toEqual({ model: "m" });
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

  it("forbids tools on the closing step by not sending them", async () => {
    // Omitted rather than sent with `tool_choice: "none"`. Both stop the call,
    // but sending the schemas spends tokens on declarations the model may not
    // use — and the other protocol omitted them, so the two disagreed about what
    // a model can even see.
    let body: { tool_choice?: string; tools?: unknown } = {};
    const step = createStepFunction({
      ...request,
      fetchImpl: async (_url, init) => {
        body = JSON.parse(String(init?.body)) as { tool_choice?: string; tools?: unknown };
        return jsonResponse({ choices: [{ message: { content: "final" }, finish_reason: "stop" }] });
      },
    });
    await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: false });
    expect(body.tool_choice).toBeUndefined();
    expect(body.tools).toBeUndefined();
  });

  it("maps a refusal to an error stop reason rather than a finished one", async () => {
    // A content filter is the provider refusing, not the model finishing. The
    // refusal has to reach the kernel as an error so the turn stops instead of
    // treating a refusal as a completed answer.
    const step = createStepFunction({
      ...request,
      fetchImpl: async () =>
        jsonResponse({
          choices: [{ message: { content: "" }, finish_reason: "content_filter" }],
        }),
    });

    const result = await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: true });

    expect(result.stopReason).toBe("error");
  });

  it("explains an empty answer instead of inventing one", async () => {
    // An answer with no content and no refusal reason is the provider saying
    // nothing, not the provider refusing: the refusal is `content_filter`, which
    // is an error, while an empty finish is a step to explain rather than a
    // stop to report as clean.
    const step = createStepFunction({
      ...request,
      fetchImpl: async () => jsonResponse({ choices: [{ message: { content: "" }, finish_reason: "stop" }] }),
    });
    const result = await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: true });
    expect(result.text).toBe("");
    expect(result.errorMessage).toContain("returned nothing at all");
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

    // Nested under `prompt_tokens_details` on this family of providers. Cache
    // traffic is per model, so it is read from the bucket for the model that
    // answered rather than from a session-level field.
    expect(getSessionUsage("sess_cache_openai").byModel.m?.cacheReadTokens).toBe(768);
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
    expect(usage.byModel.m?.cacheReadTokens).toBe(512);
    expect(usage.byModel.m?.cacheWriteTokens).toBe(256);
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
    expect(usage.byModel.m?.cacheReadTokens).toBe(0);
    expect(usage.byModel.m?.cacheWriteTokens).toBe(0);
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

  it("records what kind of failure a rejected request was", async () => {
    // The message alone is prose every provider words differently, so nothing
    // downstream can act on it without matching text. The class is the part
    // that distinguishes an expired credential from an exhausted quota.
    const cases: Array<[number, string, string]> = [
      [401, "unauthorized", "provider_auth"],
      [403, "forbidden", "provider_auth"],
      [429, "slow down", "provider_rate_limited"],
      [500, "server error", "provider_endpoint"],
    ];

    for (const [status, body, expected] of cases) {
      const step = createStepFunction({
        ...request,
        fetchImpl: async () =>
          ({
            ok: false,
            status,
            headers: new Headers(),
            text: async () => body,
          }) as unknown as Response,
      });

      const result = await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: true });

      expect(result.failureClass, `status ${status}`).toBe(expected);
      // The provider's own words survive alongside it.
      expect(result.errorMessage).toContain(body);
    }
  });

  it("records a safety block as its own class rather than a status", async () => {
    // A content filter arrives with whatever status the provider chose, so the
    // class cannot be derived from the status alone.
    const step = createStepFunction({
      ...request,
      fetchImpl: async () =>
        ({
          ok: false,
          status: 400,
          headers: new Headers(),
          text: async () => '{"error":{"type":"content_filter","message":"blocked"}}',
        }) as unknown as Response,
    });

    const result = await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: true });

    expect(result.failureClass).toBe("provider_safety_block");
  });

  it("records no class for a network failure the provider never answered", async () => {
    // There is no status to classify, and the transport failure already has its
    // own wording. Recording a class here would mean inventing one.
    const step = createStepFunction({
      ...request,
      fetchImpl: async () => {
        throw new Error("socket hang up");
      },
    });

    const result = await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: true });

    expect(result.failureClass).toBeUndefined();
    expect(result.errorMessage).toContain("socket hang up");
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

  it("sends the model's own ceiling when the run set none", async () => {
    // The ceiling is a property of the model: a value that fits one is truncated
    // by another. The run-wide setting wins when it is set; when it is not, the
    // catalog's value is what the request falls back to.
    let body: Record<string, unknown> = {};
    const step = createStepFunction({
      ...request,
      maxOutputTokens: undefined,
      catalog: [
        {
          id: "vendor",
          label: "Vendor",
          runtime: "openai-compatible",
          auth: "api-key",
          models: [{ id: "m", contextWindow: 128_000, maxTokens: 16_384 }],
        },
      ],
      fetchImpl: async (_url, init) => {
        body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return jsonResponse({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] });
      },
    });

    await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: true });

    expect(body.max_tokens).toBe(16_384);
  });

  it("lets the run's ceiling win over the model's", async () => {
    let body: Record<string, unknown> = {};
    const step = createStepFunction({
      ...request,
      maxOutputTokens: 777,
      catalog: [
        {
          id: "vendor",
          label: "Vendor",
          runtime: "openai-compatible",
          auth: "api-key",
          models: [{ id: "m", contextWindow: 128_000, maxTokens: 16_384 }],
        },
      ],
      fetchImpl: async (_url, init) => {
        body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return jsonResponse({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] });
      },
    });

    await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: true });

    expect(body.max_tokens).toBe(777);
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

describe("speaking a second endpoint", () => {
  /** An answer in the second endpoint's own event format. */
  function anthropicSse(text: string): Response {
    const frames = [
      `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 9 } } })}\n\n`,
      `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } })}\n\n`,
      `event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 4 } })}\n\n`,
      `event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`,
    ].join("");
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(frames));
        controller.close();
      },
    });
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/event-stream" }),
      body,
      text: async () => "",
      json: async () => ({}),
    } as unknown as Response;
  }

  it("posts to the endpoint's own path with its own body", async () => {
    // The whole reason a second endpoint exists: the default path and body are
    // rejected by this host, so a request built in the default shape cannot
    // succeed however correct the rest of it is.
    let seenUrl = "";
    let seenBody: Record<string, unknown> = {};
    let seenHeaders: Record<string, string> = {};
    const step = createStepFunction({
      ...request,
      provider: {
        headers: { "x-api-key": "k", "anthropic-version": "2023-06-01" },
        baseUrl: "https://api.anthropic.test/v1",
        model: "claude-sonnet-4-5",
        provider: "anthropic",
        endpoint: "anthropic-messages",
      },
      fetchImpl: async (url, init) => {
        seenUrl = String(url);
        seenBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        seenHeaders = (init?.headers ?? {}) as Record<string, string>;
        return anthropicSse("hello");
      },
    });

    const result = await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: true });

    expect(seenUrl).toBe("https://api.anthropic.test/v1/messages");
    // The instruction is its own field here, not a message.
    expect(seenBody.system).toEqual([
      { type: "text", text: "be brief", cache_control: { type: "ephemeral" } },
    ]);
    expect(Array.isArray(seenBody.messages)).toBe(true);
    expect((seenBody.messages as readonly { role: string }[]).every((m) => m.role !== "system")).toBe(true);
    expect(typeof seenBody.max_tokens).toBe("number");
    expect(seenHeaders["x-api-key"]).toBe("k");
    expect(result.text).toBe("hello");
  });

  it("reads usage from both halves of that endpoint's stream", async () => {
    // The input side arrives on the first event and the output side later, so a
    // reader that took one of them would report a prompt size of zero.
    resetSessionUsage("sess_step_anthropic");
    const step = createStepFunction({
      ...request,
      sessionId: "sess_step_anthropic",
      provider: {
        headers: { "x-api-key": "k" },
        baseUrl: "https://api.anthropic.test/v1",
        model: "claude-sonnet-4-5",
        provider: "anthropic",
        endpoint: "anthropic-messages",
      },
      fetchImpl: async () => anthropicSse("ok"),
    });

    await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: true });

    const usage = getSessionUsage("sess_step_anthropic");
    const bucket = Object.values(usage.byModel)[0];
    expect(bucket?.promptTokens).toBe(9);
    expect(bucket?.completionTokens).toBe(4);
  });

  it("still uses the default path when no endpoint is declared", async () => {
    // The default has to stay exactly as it was: every provider that worked
    // before declares no endpoint, so the branch must not change their request.
    let seenUrl = "";
    const step = createStepFunction({
      ...request,
      fetchImpl: async (url) => {
        seenUrl = String(url);
        return jsonResponse({ choices: [{ message: { content: "hi" }, finish_reason: "stop" }] });
      },
    });

    await step([{ role: "user", content: "q" }], undefined, {}, { allowTools: true });

    expect(seenUrl).toBe("https://provider.test/v1/chat/completions");
  });
  /**
   * The claim the protocol registry exists to make, measured where it counts.
   *
   * A protocol declared from this file — not shipped, not named anywhere in
   * `src/` — is driven through the real step function by naming it in the
   * catalog. Nothing in the turn loop was edited to allow that: `step.ts` asks
   * the registry for the body and the registry has never heard of this kind
   * except from this file's own declaration. If the payload were still built from
   * a branch on the kind, this request would go out as the default shape and the
   * assertion below would fail on the body it received.
   */
  it("sends a protocol it has never heard of through the same path", async () => {
    const STUB = "test-turn-protocol";
    declareEndpoint(STUB, {
      path: () => "/stub-turn",
      headers: () => ({ "x-stub": "1" }),
      body: () => ({}),
      turnBody: (input) => ({ stub_turn: input.model, stub_tools: input.tools.length }),
      readBody: () => ({ choices: [{ message: { content: "from the stub" } }] }),
      readStream: () => {
        throw new Error("the stub does not stream");
      },
    });

    let url = "";
    let body: Record<string, unknown> = {};
    const step = createStepFunction({
      ...request,
      provider: { apiKey: "k", baseUrl: "https://provider.test/v1", model: "m", endpoint: STUB },
      catalog: [
        { id: "stub-vendor", label: "Stub", runtime: "openai-compatible", auth: "api-key", models: [{ id: "m" }] },
      ],
      fetchImpl: async (sentUrl, init) => {
        url = String(sentUrl);
        body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return jsonResponse({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] });
      },
    });

    const result = await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: true });

    // The resource is the stub's, so the registry answered the URL question too.
    expect(url).toBe("https://provider.test/v1/stub-turn");
    expect(body).toEqual({ stub_turn: "m", stub_tools: 0 });
    expect(result.stopReason).toBe("stop");
  });

  /**
   * A name the build does not speak comes from a file a person edited, so the
   * step has to say which name and which kinds exist. An uncaught throw here
   * would leave the turn through the loop's retry wrapper — which does not catch
   * it — and reach the user as a crash that never mentions the file.
   */
  it("reports an endpoint kind nobody declared instead of crashing", async () => {
    const step = createStepFunction({
      ...request,
      provider: { apiKey: "k", baseUrl: "https://provider.test/v1", model: "m", endpoint: "not-a-kind" },
      catalog: [
        { id: "v", label: "V", runtime: "openai-compatible", auth: "api-key", models: [{ id: "m" }] },
      ],
      fetchImpl: async () => {
        throw new Error("no request should have been sent");
      },
    });

    const result = await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: true });

    expect(result.stopReason).toBe("error");
    expect(result.errorMessage).toContain("not-a-kind");
    // And it names the kinds that do exist, which is the part that makes the
    // message actionable rather than merely accurate.
    expect(result.errorMessage).toContain("openai-compatible");
  });

});

describe("the last step a run may act on", () => {
  /** A tool the model may call, so the notice has something to withdraw. */
  const TOOL_FOR_THE_NOTICE = [{
    type: "function" as const,
    function: { name: "read", description: "read a file", parameters: { type: "object", properties: {} } },
  }];

  async function bodyFor(allowTools: boolean, tools = request.tools): Promise<Record<string, unknown>> {
    let body: Record<string, unknown> = {};
    const step = createStepFunction({
      ...request,
      tools,
      fetchImpl: async (_url: string | URL, init?: RequestInit) => {
        body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return jsonResponse({ choices: [{ message: { content: "ok" } }] });
      },
    });
    await step([{ role: "user", content: "do the thing" }], undefined, {}, { allowTools });
    return body;
  }

  it("says so when the tools have been withdrawn", async () => {
    // Withdrawing the tools is not self-explanatory. A model that sees its tool
    // list and cannot call from it reads the harness as broken rather than the
    // budget as reached, and the useful move — answer with what you have — is
    // one it has to be told to make.
    const body = await bodyFor(false, TOOL_FOR_THE_NOTICE);
    const messages = body.messages as Array<{ role: string; content: string }>;

    expect(messages[messages.length - 1]!.content).toMatch(/reached the limit/i);
    expect(messages[messages.length - 1]!.content).toMatch(/cannot call any more tools/i);
  });

  it("says nothing of the kind on a run that never had tools", async () => {
    // A run configured with no tools did not reach a limit; there was no budget
    // to spend. Telling its model about a withdrawn tool list it never had is a
    // false statement the model cannot check, and on the protocol that requires
    // turns to alternate it also appends a second user turn in a row.
    const body = await bodyFor(false, []);
    const messages = body.messages as Array<{ role: string; content: string }>;

    expect(JSON.stringify(messages)).not.toMatch(/reached the limit/i);
  });

  it("says nothing of the kind while tools are still available", async () => {
    const body = await bodyFor(true, TOOL_FOR_THE_NOTICE);
    const messages = body.messages as Array<{ role: string; content: string }>;

    expect(JSON.stringify(messages)).not.toMatch(/reached the limit/i);
  });

  it("sends no tool list on that step either", async () => {
    // The notice and the withdrawal travel together: a notice about tools the
    // request still carries would contradict the request.
    const body = await bodyFor(false);

    expect(body).not.toHaveProperty("tools");
  });
});
  it("retries a stream that fails before delivering any text", async () => {
    let attempts = 0;
    const step = createStepFunction({
      ...request,
      retry: { enabled: true, maxRetries: 1, baseDelayMs: 1, maxDelayMs: 1 },
      fetchImpl: async () => {
        attempts += 1;
        if (attempts === 1) {
          const body = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.error(new Error("socket hang up"));
            },
          });
          return new Response(body, { headers: { "content-type": "text/event-stream" } });
        }
        return new Response(
          `data: ${JSON.stringify({ choices: [{ delta: { content: "recovered" } }] })}\n\n` +
            `data: ${JSON.stringify({ choices: [{ delta: { content: "" }, finish_reason: "stop" }] })}\n\n` +
            "data: [DONE]\n\n",
          { headers: { "content-type": "text/event-stream" } },
        );
      },
    });
    const result = await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: true });
    expect(attempts).toBe(2);
    expect(result.stopReason).toBe("stop");
    expect(result.text).toBe("recovered");
  });

  it("does not retry a stream that already showed reasoning, only one that showed nothing", async () => {
    // A thinking model streams its reasoning before any text. Once the user has
    // read reasoning, a retry would re-emit it — the same argument as retrying
    // after text, and it is guarded for the same reason.
    let attempts = 0;
    const seen: string[] = [];
    const step = createStepFunction({
      ...request,
      retry: { enabled: true, maxRetries: 3, baseDelayMs: 1, maxDelayMs: 1 },
      fetchImpl: async () => {
        attempts += 1;
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            const encode = (text: string) => new TextEncoder().encode(text);
            controller.enqueue(
              encode(`data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: "thinking hard" } }] })}\n\n`),
            );
            setTimeout(() => controller.error(new Error("socket hang up")), 5);
          },
        });
        return new Response(body, { headers: { "content-type": "text/event-stream" } });
      },
    });
    const result = await step(
      [{ role: "user", content: "hi" }],
      undefined,
      {
        onText: (delta) => seen.push(delta),
        onReasoning: (delta) => seen.push(delta),
      },
      { allowTools: true },
    );
    expect(attempts).toBe(1);
    expect(result.stopReason).toBe("error");
    expect(seen).toEqual(["thinking hard"]);
  });


it.each(["refusal", "guardrail_intervened", "content_filter", "safety", "recitation"])("explains %s as a refusal", (reason) => {
  expect(emptyAnswerExplanation(reason, 0)).toContain("withheld");
  expect(emptyAnswerExplanation(reason, 20)).not.toContain("/connect");
});
