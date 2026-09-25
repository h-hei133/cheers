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
    await expect(sendSentRequest(sent, undefined, impl)).resolves.toBe(false);
  });

  it("reports a network failure rather than raising it", async () => {
    const impl = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    await expect(sendSentRequest(sent, undefined, impl)).resolves.toBe(false);
  });

  it("refuses to re-send a body it cannot read", async () => {
    // Guessing at what was sent would send something else, which is worse than
    // not refreshing at all.
    const { calls, impl } = recorder();
    const broken: SentRequest = { ...sent, body: "not json" };
    await expect(sendSentRequest(broken, undefined, impl)).resolves.toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("passes the abort signal through", async () => {
    const { calls, impl } = recorder();
    const controller = new AbortController();
    await sendSentRequest(sent, controller.signal, impl);
    expect(calls[0].init.signal).toBe(controller.signal);
  });

  it("reads the answer so the provider finishes the turn", async () => {
    // A cache write lands once the prompt has been processed, so the connection
    // is not dropped early.
    let read = false;
    const impl = (async () => {
      const response = new Response("{}", { status: 200 });
      const original = response.text.bind(response);
      response.text = async () => {
        read = true;
        return original();
      };
      return response;
    }) as unknown as typeof fetch;
    await sendSentRequest(sent, undefined, impl);
    expect(read).toBe(true);
  });
});
