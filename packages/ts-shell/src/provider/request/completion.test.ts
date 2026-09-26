import { describe, expect, it } from "vitest";
import { requestSimpleCompletion } from "./completion.js";

/**
 * The out-of-band request path.
 *
 * This exists because two call sites used to build their own request against
 * whatever environment variables happened to be set, which meant the endpoint
 * shape, credential, and transport decided here never applied to them. What the
 * tests below pin is that the request goes through this layer: the shape follows
 * the declared endpoint, and the headers and transport come from the provider
 * value rather than from the ambient environment.
 */

function capturingFetch(): {
  readonly fetchImpl: typeof fetch;
  readonly requests: Array<{ url: string; init: RequestInit }>;
} {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init: init ?? {} });
    return new Response(
      JSON.stringify({ choices: [{ message: { content: "  the answer  " } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof fetch;
  return { fetchImpl, requests };
}

describe("an out-of-band completion", () => {
  it("returns the answer text, trimmed", async () => {
    const { fetchImpl } = capturingFetch();

    const answer = await requestSimpleCompletion({
      provider: { headers: {}, baseUrl: "https://api.example.test/v1", model: "m", fetchImpl },
      messages: [{ role: "user", content: "hello" }],
    });

    expect(answer).toBe("the answer");
  });

  it("sends the headers the provider carries, not ones read from the environment", async () => {
    // The point of the layer: a credential resolved by the session reaches the
    // request. A call site that formatted its own header from an environment
    // variable is exactly what this replaced.
    const { fetchImpl, requests } = capturingFetch();

    await requestSimpleCompletion({
      provider: {
        headers: { Authorization: "Bearer resolved-elsewhere", "x-account": "acct-1" },
        baseUrl: "https://api.example.test/v1",
        model: "m",
        fetchImpl,
      },
      messages: [{ role: "user", content: "hello" }],
    });

    expect(requests[0]!.init.headers).toEqual({
      Authorization: "Bearer resolved-elsewhere",
      "x-account": "acct-1",
    });
  });

  it("uses the transport it was given", async () => {
    // The transport carries the deadlines. Falling back to the global fetch here
    // is what left a provider that accepts a connection and then stalls holding
    // the call open with nothing to time it out.
    const { fetchImpl, requests } = capturingFetch();

    await requestSimpleCompletion({
      provider: { headers: {}, baseUrl: "https://api.example.test/v1", model: "m", fetchImpl },
      messages: [{ role: "user", content: "hello" }],
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe("https://api.example.test/v1/chat/completions");
  });

  it("speaks the endpoint the provider names", async () => {
    // A side question is a model call like any other, so it has to speak whatever
    // the run speaks. Posting the default shape at an endpoint that wants another
    // fails a call that had nothing else wrong with it.
    const { fetchImpl, requests } = capturingFetch();

    await requestSimpleCompletion({
      provider: {
        headers: {},
        baseUrl: "https://api.example.test",
        model: "m",
        endpoint: "anthropic-messages",
        fetchImpl,
      },
      messages: [{ role: "user", content: "hello" }],
    });

    expect(requests[0]!.url).toBe("https://api.example.test/messages");
    expect(String(requests[0]!.init.body)).toContain('"max_tokens"');
  });

  it("omits a temperature the model is declared to reject", async () => {
    const { fetchImpl, requests } = capturingFetch();

    await requestSimpleCompletion({
      provider: { headers: {}, baseUrl: "https://api.example.test/v1", model: "m", fetchImpl },
      messages: [{ role: "user", content: "hello" }],
      supportsTemperature: false,
    });

    expect(String(requests[0]!.init.body)).not.toContain("temperature");
  });

  it("answers nothing when the provider refuses, rather than throwing", async () => {
    // Every caller of this is a side channel. A refusal is an absent answer, and
    // making them handle an exception would only move the same decision to a
    // worse place.
    const fetchImpl = (async () =>
      new Response("nope", { status: 401 })) as unknown as typeof fetch;

    const answer = await requestSimpleCompletion({
      provider: { headers: {}, baseUrl: "https://api.example.test/v1", model: "m", fetchImpl },
      messages: [{ role: "user", content: "hello" }],
    });

    expect(answer).toBeUndefined();
  });

  it("answers nothing when the provider returns empty content", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "   " } }] }), {
        status: 200,
      })) as unknown as typeof fetch;

    const answer = await requestSimpleCompletion({
      provider: { headers: {}, baseUrl: "https://api.example.test/v1", model: "m", fetchImpl },
      messages: [{ role: "user", content: "hello" }],
    });

    expect(answer).toBeUndefined();
  });
});

describe("the system instruction of an out-of-band request", () => {
  /**
   * It travels in the field that protocol has for it, not as a message.
   *
   * One protocol drops a `system` role from `messages` outright — its system
   * instruction is a top-level field and a `system` message there is rejected.
   * A caller writing the instruction as the first message therefore had it
   * silently discarded, and the request arrived with no instruction at all.
   */
  it("arrives as the system field on the protocol that requires it", async () => {
    const { fetchImpl, requests } = capturingFetch();

    await requestSimpleCompletion({
      provider: {
        headers: {},
        baseUrl: "https://api.example.test",
        model: "m",
        endpoint: "anthropic-messages",
        fetchImpl,
      },
      messages: [
        { role: "system", content: "answer in one line" },
        { role: "user", content: "hello" },
      ],
    });

    const body = JSON.parse(String(requests[0]!.init.body)) as Record<string, unknown>;
    expect(JSON.stringify(body.system)).toContain("answer in one line");
    // And not left in the messages, where it would be dropped a second time.
    expect(JSON.stringify(body.messages)).not.toContain("answer in one line");
  });

  it("arrives as the leading message on the protocol that keeps it there", async () => {
    const { fetchImpl, requests } = capturingFetch();

    await requestSimpleCompletion({
      provider: {
        headers: {},
        baseUrl: "https://api.example.test",
        model: "m",
        endpoint: "openai-compatible",
        fetchImpl,
      },
      messages: [
        { role: "system", content: "answer in one line" },
        { role: "user", content: "hello" },
      ],
    });

    const body = JSON.parse(String(requests[0]!.init.body)) as Record<string, unknown>;
    const messages = body.messages as Array<{ role: string; content: string }>;
    expect(messages[0]!.role).toBe("system");
    expect(messages[0]!.content).toBe("answer in one line");
  });
});
