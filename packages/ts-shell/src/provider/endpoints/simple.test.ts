import { describe, expect, it } from "vitest";
import { requestCompactionSummary } from "../../core/query/compaction/summarize.js";
import { requestSimpleCompletion } from "../request/completion.js";
import { withRequestSigner } from "../request/fetch.js";
import { endpointBody, endpointTurnBody, endpointUrl } from "./index.js";

const messages = [{ role: "user" as const, content: "Summarize this conversation." }];

// Select the response format from the actual request. A streamed request cannot
// pass a single-JSON consumer merely because the fixture always returns JSON.
function transport(endpoint: string) {
  const requests: Array<{ url: string; init: RequestInit; body: Record<string, unknown> }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    requests.push({ url, init: init ?? {}, body });
    const single = endpoint === "anthropic-messages" ? body.stream === false : url.endsWith("/converse");
    if (!single) return new Response("event: stream\ndata: {}\n\n", { headers: { "content-type": "text/event-stream" } });
    return Response.json(endpoint === "anthropic-messages"
      ? { content: [{ type: "text", text: "paired summary" }], stop_reason: "end_turn" }
      : { output: { message: { content: [{ text: "paired summary" }] } }, stopReason: "end_turn" });
  };
  return { requests, fetchImpl };
}

describe.each(["anthropic-messages", "bedrock-converse-stream"])("%s single requests", endpoint => {
  const provider = { endpoint, baseUrl: "https://fixture.test", model: "model/one",
    headers: { "content-type": "application/json", Accept: "text/event-stream", "x-test-header": "preserved" } };
  const expectedUrl = endpoint === "anthropic-messages" ? "https://fixture.test/messages" : "https://fixture.test/model/model%2Fone/converse";

  it.each(["side", "compact"])("pairs %s request with JSON, cancellation and the final signed URL", async mode => {
    const captured = transport(endpoint);
    const signed: string[] = [];
    const fetchImpl = withRequestSigner(captured.fetchImpl, async request => {
      signed.push(request.url);
      expect(request.headers.accept).toBe("application/json");
      return { "x-test-signature": "fixture-only" };
    });
    const signal = new AbortController().signal;
    const result = mode === "side"
      ? await requestSimpleCompletion({ provider: { ...provider, fetchImpl }, messages, signal })
      : await requestCompactionSummary({ provider, messages, signal, fetchImpl });
    expect(result).toContain("paired summary");
    expect(signed).toEqual([expectedUrl]);
    expect(captured.requests).toHaveLength(1);
    const request = captured.requests[0]!;
    expect(request.url).toBe(expectedUrl);
    expect(request.init.signal).toBe(signal);
    expect(new Headers(request.init.headers).get("accept")).toBe("application/json");
    expect(new Headers(request.init.headers).get("x-test-header")).toBe("preserved");
    expect(new Headers(request.init.headers).get("x-test-signature")).toBe("fixture-only");
    expect(provider.headers.Accept).toBe("text/event-stream");
    expect(request.body.tools).toBeUndefined();
    expect(request.body.toolConfig).toBeUndefined();
  });

  it("keeps main turns streaming even when they offer no tools", () => {
    const body = endpointTurnBody(endpoint, { model: provider.model, systemPrompt: "be brief", messages,
      tools: [], allowTools: false, vision: false, temperature: 0.2, systemRole: "system",
      reasoningEffort: false, maxTokensField: "max_tokens", assistantAfterToolResult: false });
    if (endpoint === "anthropic-messages") expect(body.stream).toBe(true);
    else expect(endpointUrl(provider.baseUrl, endpoint, provider.model)).toBe("https://fixture.test/model/model%2Fone/converse-stream");
  });
});

it("preserves temperature capability and the explicit token ceiling for single messages", () => {
  const input = { model: "native-model", messages, temperature: 0.2, maxOutputTokens: 123 };
  expect(endpointBody("anthropic-messages", { ...input, supportsTemperature: false })).toMatchObject({ stream: false, max_tokens: 123 });
  expect(endpointBody("anthropic-messages", { ...input, supportsTemperature: false })).not.toHaveProperty("temperature");
  expect(endpointBody("anthropic-messages", input).temperature).toBe(0.2);
});
