import { describe, expect, it } from "vitest";
import { sendSentRequest, type SentRequest } from "./sentRequest.js";

/**
 * Sending a request that has already been sent, to keep its prefix cached.
 *
 * The whole value of this depends on the bytes matching the original: a cache is
 * keyed on the request's own prefix, so a body that differs anywhere near the
 * front arrives as a miss and is charged at the full write price. These tests
 * pin that the request goes out as it went out, and that only the output ceiling
 * changed.
 */

const sent: SentRequest = {
  url: "https://api.test/v1/chat/completions",
  headers: { authorization: "Bearer k" },
  body: JSON.stringify({
    model: "m",
    messages: [{ role: "system", content: "be brief" }, { role: "user", content: "hi" }],
    max_tokens: 4096,
  }),
};

/** A fetch that records the call and answers with a small body. */
function recorder(ok = true): { calls: Array<{ url: string; init: RequestInit }>; impl: typeof fetch } {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(ok ? "{}" : "no", { status: ok ? 200 : 500 });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

describe("sending a captured request again", () => {
  it("goes to the same URL with the same headers", async () => {
    const { calls, impl } = recorder();
    await sendSentRequest(sent, undefined, impl);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(sent.url);
    expect(calls[0].init.headers).toEqual(sent.headers);
  });

  it("keeps every field of the original body", async () => {
    // The prefix is the cached part, so nothing in it may be dropped, reordered
    // or rewritten. `max_tokens` is the one exception, checked below.
    const { calls, impl } = recorder();
    await sendSentRequest(sent, undefined, impl);

    const original = JSON.parse(sent.body);
    const resent = JSON.parse(String(calls[0].init.body));
    expect(resent.model).toBe(original.model);
    expect(resent.messages).toEqual(original.messages);
  });

  it("lowers the output ceiling to the least a provider allows", async () => {
    // Without this the model answers the whole question again, and the refresh
    // costs as much as the request it was meant to make cheaper.
    const { calls, impl } = recorder();
    await sendSentRequest(sent, undefined, impl);

    expect(JSON.parse(String(calls[0].init.body)).max_tokens).toBe(1);
  });

  it("uses whichever field the endpoint carries the ceiling in", async () => {
    // A model on the newer field would otherwise be sent both, and the provider
    // would reject the request.
    const { calls, impl } = recorder();
    const newer: SentRequest = {
      ...sent,
      body: JSON.stringify({ model: "m", messages: [], max_completion_tokens: 4096 }),
    };
    await sendSentRequest(newer, undefined, impl);

    const resent = JSON.parse(String(calls[0].init.body));
    expect(resent.max_completion_tokens).toBe(1);
    expect(resent.max_tokens).toBeUndefined();
  });

  it("reports a refusal rather than raising it", async () => {
    // Nothing the user did caused it and nothing they could do would fix it.
    const { impl } = recorder(false);
    await expect(sendSentRequest(sent, undefined, impl)).resolves.toBeUndefined();
  });

  it("reports a network failure rather than raising it", async () => {
    const impl = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    await expect(sendSentRequest(sent, undefined, impl)).resolves.toBeUndefined();
  });

  it("refuses to re-send a body it cannot read", async () => {
    // Guessing at what was sent would send something else, which is worse than
    // not refreshing at all.
    const { calls, impl } = recorder();
    const broken: SentRequest = { ...sent, body: "not json" };
    await expect(sendSentRequest(broken, undefined, impl)).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it("passes the abort signal through", async () => {
    const { calls, impl } = recorder();
    const controller = new AbortController();
    await sendSentRequest(sent, controller.signal, impl);
    expect(calls[0].init.signal).toBeDefined();
    expect(calls[0].init.signal?.aborted).toBe(true);
  });

  it("reads the answer so the provider finishes the turn", async () => {
    // A cache write lands once the prompt has been processed, so the connection
    // is not dropped early.
    let read = false;
    const impl = (async () => {
      const response = new Response("{}", { status: 200 });
      const original = response.json.bind(response);
      response.json = async () => {
        read = true;
        return original();
      };
      return response;
    }) as unknown as typeof fetch;
    await sendSentRequest(sent, undefined, impl);
    expect(read).toBe(true);
  });
});


describe("protocol cache refresh", () => {
  it.each([
    ["openai-compatible", { max_tokens: 4096 }, { max_tokens: 1 }],
    ["openai-compatible", { max_completion_tokens: 4096, reasoning_effort: "high" }, { max_completion_tokens: 1, reasoning_effort: "high" }],
    ["anthropic-messages", { max_tokens: 4096 }, { max_tokens: 1 }],
    ["google-generative-ai", { generationConfig: { maxOutputTokens: 4096, temperature: 0.2 } }, { generationConfig: { maxOutputTokens: 1, temperature: 0.2 } }],
    ["google-vertex", { generationConfig: { topP: 0.5 } }, { generationConfig: { maxOutputTokens: 1, topP: 0.5 } }],
    ["bedrock-converse-stream", { inferenceConfig: { maxTokens: 4096, temperature: 0.2 } }, { inferenceConfig: { maxTokens: 1, temperature: 0.2 } }],
  ])("lowers only the %s output ceiling", async (endpoint, original, expected) => {
    const { calls, impl } = recorder();
    const prefix = { messages: [{ role: "user", content: "cached bytes" }], tools: [{ name: "tool" }], system: "system" };
    const captured = { ...sent, endpoint, reasoning: false, body: JSON.stringify({ ...prefix, ...original }) };
    await sendSentRequest(captured, undefined, impl);
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ ...prefix, ...expected });
    expect(captured.body).toBe(JSON.stringify({ ...prefix, ...original }));
  });

  it.each([
    ["anthropic-messages", { thinking: { type: "enabled", budget_tokens: 2048 } }],
    ["bedrock-converse-stream", { additionalModelRequestFields: { thinking: { type: "enabled", budget_tokens: 2048 } } }],
    ["google-generative-ai", { generationConfig: { thinkingConfig: { thinkingBudget: 2048 } } }],
    ["google-vertex", { generationConfig: { thinkingConfig: { thinkingBudget: -1 } } }],
  ])("does not invalidate a budgeted thinking prefix on %s", async (endpoint, body) => {
    const { calls, impl } = recorder();
    await sendSentRequest({ ...sent, endpoint, body: JSON.stringify(body) }, undefined, impl);
    expect(calls).toEqual([]);
  });

  it.each(["null", "[]", "42"])("refuses non-object body %s without throwing", async (body) => {
    const { calls, impl } = recorder();
    await expect(sendSentRequest({ ...sent, body }, undefined, impl)).resolves.toBeUndefined();
    expect(calls).toEqual([]);
  });

  it("returns usage only after a complete stream and releases the request", async () => {
    let signal: AbortSignal | undefined;
    const impl = (async (_url, init) => {
      signal = init?.signal ?? undefined;
      return new Response('data: {"choices":[{"delta":{},"finish_reason":"length"}],"usage":{"prompt_tokens":100,"completion_tokens":1}}\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } });
    }) as typeof fetch;
    expect(await sendSentRequest(sent, undefined, impl)).toEqual({ prompt_tokens: 100, completion_tokens: 1 });
    expect(signal?.aborted).toBe(true);
  });
});


it.each([undefined, true])("does not assume Google default thinking is disabled (reasoning=%s)", async reasoning => {
  const { calls, impl } = recorder();
  await sendSentRequest({ ...sent, endpoint: "google-generative-ai", reasoning, body: JSON.stringify({ contents: [], generationConfig: {} }) }, undefined, impl);
  expect(calls).toEqual([]);
});

it("replays Google with explicitly disabled thinking and preserves that setting", async () => {
  const { calls, impl } = recorder();
  await sendSentRequest({ ...sent, endpoint: "google-generative-ai", reasoning: true,
    body: JSON.stringify({ contents: [], generationConfig: { thinkingConfig: { thinkingBudget: 0 } } }),
  }, undefined, impl);
  expect(JSON.parse(String(calls[0]?.init.body)).generationConfig).toEqual({ thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 1 });
});

it("does not admit usage from an unfinished stream", async () => {
  const impl = (async () => new Response('data: {"choices":[{"delta":{"content":"partial"}}],"usage":{"prompt_tokens":100}}\n\n', { headers: { "content-type": "text/event-stream" } })) as typeof fetch;
  expect(await sendSentRequest(sent, undefined, impl)).toBeUndefined();
});

it.each([false, true])("does not admit refused response usage (stream=%s)", async stream => {
  const choice = { message: { content: "" }, delta: {}, finish_reason: "content_filter" };
  const body = { choices: [choice], usage: { prompt_tokens: 100, completion_tokens: 1 } };
  const impl = (async () => new Response(stream ? `data: ${JSON.stringify(body)}\n\ndata: [DONE]\n\n` : JSON.stringify(body), {
    headers: { "content-type": stream ? "text/event-stream" : "application/json" },
  })) as typeof fetch;
  expect(await sendSentRequest(sent, undefined, impl)).toBeUndefined();
});

it.each([false, true])("rejects usage when transport ignores cancellation (stream=%s)", async stream => {
  const controller = new AbortController();
  const body = { choices: [{ message: { content: "x" }, delta: { content: "x" }, finish_reason: "stop" }], usage: { prompt_tokens: 100 } };
  const impl = (async () => {
    controller.abort();
    return new Response(stream ? `data: ${JSON.stringify(body)}\n\ndata: [DONE]\n\n` : JSON.stringify(body), {
      headers: { "content-type": stream ? "text/event-stream" : "application/json" },
    });
  }) as typeof fetch;
  expect(await sendSentRequest(sent, controller.signal, impl)).toBeUndefined();
});

it.each([
  ["anthropic-messages", { content: [], stop_reason: "refusal", usage: { input_tokens: 100, output_tokens: 1 } }],
  ["google-generative-ai", { candidates: [{ content: { parts: [] }, finishReason: "SAFETY" }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 1 } }],
  ["google-vertex", { candidates: [{ content: { parts: [] }, finishReason: "SAFETY" }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 1 } }],
  ["bedrock-converse-stream", { output: { message: { content: [] } }, stopReason: "guardrail_intervened", usage: { inputTokens: 100, outputTokens: 1 } }],
  ["bedrock-converse-stream", { output: { message: { content: [] } }, stopReason: "content_filtered", usage: { inputTokens: 100, outputTokens: 1 } }],
])("does not admit rejected native JSON usage on %s", async (endpoint, body) => {
  const impl = (async () => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } })) as typeof fetch;
  expect(await sendSentRequest({ ...sent, endpoint, reasoning: false }, undefined, impl)).toBeUndefined();
});
