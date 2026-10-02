import { describe, expect, it } from "vitest";
import { requestSimpleCompletion } from "../request/completion.js";
import { requestCompactionSummary } from "../../core/query/compaction/summarize.js";
import { createStepFunction } from "../../turn/step.js";
import { endpointUrl } from "./index.js";

const answer = { candidates: [{ content: { parts: [{ text: "paired answer" }] }, finishReason: "STOP" }] };
// Return the wire format selected by the URL, so a caller using the wrong
// method or omitting SSE negotiation cannot pass by receiving a canned JSON.
function transport() {
  const urls: string[] = [];
  const requests: RequestInit[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    urls.push(url.href);
    requests.push(init ?? {});
    if (url.pathname.endsWith(":generateContent")) return Response.json(answer);
    if (url.searchParams.get("alt") === "sse") {
      return new Response(`data: ${JSON.stringify(answer)}\n\n`, { headers: { "content-type": "text/event-stream" } });
    }
    return Response.json([answer]);
  };
  return { urls, requests, fetchImpl };
}

describe.each([
  ["google-generative-ai", "https://google.test", "/v1beta/models/"],
  ["google-vertex", "https://vertex.test/v1/projects/p/locations/global/publishers/google/models", "/"],
])("%s request methods", (endpoint, baseUrl, prefix) => {
  const provider = { endpoint, baseUrl, model: "gemini-model", headers: { "x-test-credential": "test-only", Accept: "text/event-stream" } };
  const messages = [{ role: "user" as const, content: "hello" }];
  const expected = `${baseUrl}${prefix}gemini-model`;

  it("pairs side questions with a single JSON document", async () => {
    const captured = transport();
    const controller = new AbortController();
    const result = await requestSimpleCompletion({ provider: { ...provider, fetchImpl: captured.fetchImpl }, messages,
      signal: controller.signal });
    expect(result).toBe("paired answer");
    expect(captured.urls).toEqual([`${expected}:generateContent`]);
    expect(captured.requests[0]!.signal).toBe(controller.signal);
    expect(new Headers(captured.requests[0]!.headers).get("accept")).toBe("application/json");
    expect(new Headers(captured.requests[0]!.headers).get("x-test-credential")).toBe("test-only");
    expect(provider.headers.Accept).toBe("text/event-stream");
    const body = JSON.parse(String(captured.requests[0]!.body));
    expect(body.contents[0].parts[0].text).toBe("hello");
    expect(body.tools).toBeUndefined();
  });

  it("pairs compaction with a single JSON document", async () => {
    const captured = transport();
    const result = await requestCompactionSummary({ provider, messages, fetchImpl: captured.fetchImpl });
    expect(result).toContain("paired answer");
    expect(captured.urls).toEqual([`${expected}:generateContent`]);
    expect(new Headers(captured.requests[0]!.headers).get("accept")).toBe("application/json");
    expect(new Headers(captured.requests[0]!.headers).get("x-test-credential")).toBe("test-only");
    expect(provider.headers.Accept).toBe("text/event-stream");
  });

  it("pairs main turns with SSE and captures the URL actually sent", async () => {
    const captured = transport();
    const sent: string[] = [];
    const text: string[] = [];
    const step = createStepFunction({ provider, workspaceRoot: process.cwd(), sessionId: `paired-${endpoint}`,
      systemPrompt: "be brief", tools: [], fetchImpl: captured.fetchImpl });
    const result = await step(messages, undefined, { onText: chunk => { text.push(chunk); } }, {
      allowTools: false, onRequestSent: request => { sent.push(request.url); },
    });
    expect(result.text).toBe("paired answer");
    expect(result.stopReason).not.toBe("error");
    expect(text.join("")).toBe("paired answer");
    expect(captured.urls).toEqual([`${expected}:streamGenerateContent?alt=sse`]);
    expect(sent).toEqual(captured.urls);
  });

  it("encodes the whole model path segment in both request modes", () => {
    for (const stream of [false, true]) {
      const url = endpointUrl(`${baseUrl}/`, endpoint, "model/with ?query", stream);
      expect(url).toBe(`${baseUrl}${prefix}model%2Fwith%20%3Fquery:${stream ? "streamGenerateContent?alt=sse" : "generateContent"}`);
    }
  });
});
