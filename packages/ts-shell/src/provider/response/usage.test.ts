import { describe, expect, it } from "vitest";
import { endpointShape } from "../endpoints/index.js";
import { crc32 } from "../aws/eventStream.js";
import { usageFromProvider } from "./usage.js";

function binary(name: string, payload: unknown): Uint8Array {
  const encoder = new TextEncoder();
  const headers: number[] = [];
  for (const [key, value] of [[":message-type", "event"], [":event-type", name]]) {
    const k = encoder.encode(key); const v = encoder.encode(value);
    headers.push(k.length, ...k, 7, v.length >> 8, v.length & 255, ...v);
  }
  const data = encoder.encode(JSON.stringify(payload));
  const bytes = new Uint8Array(16 + headers.length + data.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, bytes.length); view.setUint32(4, headers.length);
  view.setUint32(8, crc32(bytes.subarray(0, 8)));
  bytes.set(headers, 12); bytes.set(data, 12 + headers.length);
  view.setUint32(bytes.length - 4, crc32(bytes.subarray(0, bytes.length - 4)));
  return bytes;
}

const cases = [
  { endpoint: "openai-compatible", body: { choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 100, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 80 } } },
    events: [{ choices: [{ delta: { content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 80 } } }],
    expected: { promptTokens: 20, completionTokens: 5, cacheReadTokens: 80, cacheWriteTokens: 0, totalTokens: 105 } },
  { endpoint: "anthropic-messages", body: { content: [{ type: "text", text: "ok" }], stop_reason: "end_turn",
    usage: { input_tokens: 20, output_tokens: 5, cache_read_input_tokens: 80, cache_creation_input_tokens: 10 } },
    events: [{ type: "message_start", message: { usage: { input_tokens: 20, cache_read_input_tokens: 80, cache_creation_input_tokens: 10 } } },
      { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } }],
    expected: { promptTokens: 20, completionTokens: 5, cacheReadTokens: 80, cacheWriteTokens: 10, totalTokens: 115 } },
  ...["google-generative-ai", "google-vertex"].map(endpoint => ({ endpoint,
    body: { candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 2, thoughtsTokenCount: 3, cachedContentTokenCount: 80, totalTokenCount: 105 } },
    events: [{ candidates: [{ finishReason: "STOP" }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 2, thoughtsTokenCount: 3, cachedContentTokenCount: 80, totalTokenCount: 105 } }],
    expected: { promptTokens: 20, completionTokens: 5, cacheReadTokens: 80, cacheWriteTokens: 0, totalTokens: 105 } })),
  { endpoint: "bedrock-converse-stream", body: { output: { message: { content: [{ text: "ok" }] } }, usage: { inputTokens: 20, outputTokens: 5, cacheReadInputTokens: 80, cacheWriteInputTokens: 10, totalTokens: 115 } },
    events: [], expected: { promptTokens: 20, completionTokens: 5, cacheReadTokens: 80, cacheWriteTokens: 10, totalTokens: 115 } },
];

describe.each(cases)("$endpoint usage", ({ endpoint, body, events, expected }) => {
  it("counts single-response billing categories without double charging cache", () => {
    expect(usageFromProvider(endpointShape(endpoint).readBody(body).usage!)).toEqual(expected);
  });
  it("counts stream cache and reasoning usage through the same reader", async () => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      if (endpoint === "bedrock-converse-stream") {
        controller.enqueue(binary("messageStop", { stopReason: "end_turn" }));
        controller.enqueue(binary("metadata", { usage: body.usage }));
      } else {
        controller.enqueue(new TextEncoder().encode(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("")));
      }
      controller.close();
    } });
    const reader = endpointShape(endpoint).readStream(stream);
    let next = await reader.next();
    while (!next.done) next = await reader.next();
    expect(usageFromProvider(next.value.usage!)).toEqual(expected);
  });
});
