import { describe, expect, it } from "vitest";
import { endpointShape } from "./index.js";
import type { StreamedCompletion } from "../../turn/completion.js";

function byteStream(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({ start(controller) {
    // Split field names, CRLF pairs and multibyte characters at transport boundaries.
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  } });
}

async function read(endpoint: string, wire: string): Promise<StreamedCompletion> {
  const stream = endpointShape(endpoint).readStream(byteStream(wire));
  let next = await stream.next();
  while (!next.done) next = await stream.next();
  return next.value;
}

describe.each(["anthropic-messages", "google-generative-ai"])("%s SSE data lines", endpoint => {
  const payload = (text: string) => endpoint === "anthropic-messages"
    ? { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }
    : { candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] };
  const terminal = endpoint === "anthropic-messages" ? { type: "message_delta", delta: { stop_reason: "end_turn" } } : {};

  it.each(["\n", "\r\n", "\r"])("reads multiline JSON with %j lines across byte boundaries", async newline => {
    const wire = [": heartbeat", "id: frame", "event: message",
      ...JSON.stringify(payload("Hello 世界"), null, 2).split("\n").map(line => `data: ${line}`), "", "",
    ].join(newline) + `data: ${JSON.stringify(terminal)}${newline}${newline}`;
    const result = await read(endpoint, wire);
    expect(result.message.content).toBe("Hello 世界");
    expect(result.finishReason).toBe("stop");
  });

  it("does not concatenate an invalid split JSON string into invented model text", async () => {
    const broken = JSON.stringify(payload("SHOULD_JOIN")).replace("SHOULD_JOIN", "SHOULD\nJOIN");
    const wire = broken.split("\n").map(line => `data: ${line}`).join("\n") + "\n\n" +
      `data: ${JSON.stringify(payload("valid"))}\n\n` + `data: ${JSON.stringify(terminal)}\n\n`;
    const result = await read(endpoint, wire);
    expect(result.message.content).toBe("valid");
    expect(result.finishReason).toBe("stop");
  });
});
