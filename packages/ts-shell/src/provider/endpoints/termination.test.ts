import { describe, expect, it, vi } from "vitest";
import { endpointShape } from "./index.js";

const protocols = [
  {
    endpoint: "openai-compatible",
    content: { choices: [{ delta: { content: "partial 世界" } }] },
    terminals: ["[DONE]", { choices: [{ delta: {}, finish_reason: "stop" }] }],
  },
  {
    endpoint: "anthropic-messages",
    content: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "partial 世界" } },
    terminals: [{ type: "message_stop" }, { type: "message_delta", delta: { stop_reason: "end_turn" } }],
  },
  {
    endpoint: "google-generative-ai",
    content: { candidates: [{ content: { parts: [{ text: "partial 世界" }] } }] },
    terminals: [{ candidates: [{ finishReason: "STOP" }] }],
  },
];

function event(payload: unknown): string {
  return `data: ${typeof payload === "string" ? payload : JSON.stringify(payload)}\n\n`;
}

function body(wire: string): ReadableStream<Uint8Array> {
  return new ReadableStream({ start(controller) {
    for (const byte of new TextEncoder().encode(wire)) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  } });
}

describe.each(protocols)("$endpoint completion evidence", protocol => {
  it.each(["empty", "content", "malformed terminal"])("rejects %s EOF without completion evidence", async kind => {
    const wire = kind === "empty" ? "" : event(protocol.content) + (kind === "malformed terminal" ? 'data: {"unfinished"' : "");
    const stream = endpointShape(protocol.endpoint).readStream(body(wire));
    if (kind !== "empty") expect(await stream.next()).toEqual({ done: false, value: { kind: "text", text: "partial 世界" } });
    await expect(stream.next()).rejects.toThrow(/stream ended/i);
  });

  for (const terminal of protocol.terminals) {
    it.each([true, false])(`accepts ${JSON.stringify(terminal)} with blank-line termination=%s`, async terminated => {
      const wire = event(protocol.content) + (terminated ? event(terminal) : event(terminal).trimEnd());
      const stream = endpointShape(protocol.endpoint).readStream(body(wire));
      expect(await stream.next()).toEqual({ done: false, value: { kind: "text", text: "partial 世界" } });
      const result = await stream.next();
      expect(result.done).toBe(true);
      expect(result.value).toMatchObject({ message: { content: "partial 世界" } });
      if (typeof terminal !== "string" && !("type" in terminal && terminal.type === "message_stop")) {
        expect(result.value).toMatchObject({ finishReason: "stop" });
      }
    });
  }

  it("releases the transport when its consumer stops after a fragment", async () => {
    const cancel = vi.fn();
    const transport = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode(event(protocol.content)));
    }, cancel });
    const stream = endpointShape(protocol.endpoint).readStream(transport);
    expect((await stream.next()).done).toBe(false);
    await stream.return(undefined as never);
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledOnce();
    expect(transport.locked).toBe(false);
  });
});

it("preserves an unterminated error event after a native stop reason", async () => {
  const stream = endpointShape("anthropic-messages").readStream(body(
    event({ type: "message_delta", delta: { stop_reason: "end_turn" } }) +
    event({ type: "error", error: { message: "tail rejected" } }).trimEnd(),
  ));
  await expect(stream.next()).rejects.toThrow("tail rejected");
});
