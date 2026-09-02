import { describe, expect, it } from "vitest";
import {
  isEventStream,
  readCompletionStream,
  type StreamedCompletion,
} from "./streamCompletion.js";

function streamOf(...events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(event));
      controller.close();
    },
  });
}

function chunk(delta: unknown, extra: Record<string, unknown> = {}): string {
  return `data: ${JSON.stringify({ choices: [{ delta, ...extra }] })}\n\n`;
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<{
  deltas: string[];
  thinking: string[];
  result: StreamedCompletion;
}> {
  const deltas: string[] = [];
  const thinking: string[] = [];
  const iterator = readCompletionStream(stream);
  for (;;) {
    const step = await iterator.next();
    if (step.done === true) return { deltas, thinking, result: step.value };
    if (step.value.kind === "reasoning") thinking.push(step.value.text);
    else deltas.push(step.value.text);
  }
}

describe("reading a streamed completion", () => {
  it("yields each fragment as it arrives and assembles the whole", async () => {
    const { deltas, result } = await collect(
      streamOf(chunk({ content: "Hel" }), chunk({ content: "lo" }), "data: [DONE]\n\n"),
    );

    expect(deltas).toEqual(["Hel", "lo"]);
    expect(result.message.content).toBe("Hello");
  });

  it("reassembles an event split across network chunks", async () => {
    const { deltas } = await collect(
      streamOf('data: {"choices":[{"delta":{"content":"split', '"}}]}\n\n', "data: [DONE]\n\n"),
    );

    expect(deltas).toEqual(["split"]);
  });

  it("accumulates tool call arguments across chunks, keyed by index", async () => {
    const { result } = await collect(
      streamOf(
        chunk({ tool_calls: [{ index: 0, id: "call_1", function: { name: "read", arguments: '{"pa' } }] }),
        chunk({ tool_calls: [{ index: 0, function: { arguments: 'th":"a.ts"}' } }] }),
        "data: [DONE]\n\n",
      ),
    );

    expect(result.message.tool_calls).toEqual([
      { id: "call_1", type: "function", function: { name: "read", arguments: '{"path":"a.ts"}' } },
    ]);
  });

  it("keeps two concurrent tool calls apart", async () => {
    const { result } = await collect(
      streamOf(
        chunk({ tool_calls: [{ index: 0, id: "a", function: { name: "read", arguments: "{}" } }] }),
        chunk({ tool_calls: [{ index: 1, id: "b", function: { name: "grep", arguments: "{}" } }] }),
        "data: [DONE]\n\n",
      ),
    );

    expect(result.message.tool_calls?.map((call) => call.id)).toEqual(["a", "b"]);
  });

  it("drops a tool call that never received a name", async () => {
    const { result } = await collect(
      streamOf(chunk({ tool_calls: [{ index: 0, function: { arguments: "{}" } }] }), "data: [DONE]\n\n"),
    );

    expect(result.message.tool_calls).toBeUndefined();
  });

  it("carries the finish reason and the usage totals", async () => {
    const { result } = await collect(
      streamOf(
        chunk({ content: "x" }, { finish_reason: "length" }),
        `data: ${JSON.stringify({ choices: [], usage: { total_tokens: 12 } })}\n\n`,
        "data: [DONE]\n\n",
      ),
    );

    expect(result.finishReason).toBe("length");
    expect(result.usage?.total_tokens).toBe(12);
  });

  it("survives a line that is not JSON", async () => {
    const { deltas } = await collect(
      streamOf("data: not json\n\n", chunk({ content: "ok" }), "data: [DONE]\n\n"),
    );

    expect(deltas).toEqual(["ok"]);
  });

  it("ignores comments and keep-alives", async () => {
    const { deltas } = await collect(
      streamOf(": keep-alive\n\n", chunk({ content: "ok" }), "data: [DONE]\n\n"),
    );

    expect(deltas).toEqual(["ok"]);
  });

  it("recognises a stream only when the provider says it sent one", () => {
    const body = streamOf();
    expect(isEventStream({ headers: new Headers({ "content-type": "text/event-stream" }), body })).toBe(true);
    expect(isEventStream({ headers: new Headers({ "content-type": "application/json" }), body })).toBe(false);
    expect(isEventStream({ headers: new Headers({ "content-type": "text/event-stream" }), body: null })).toBe(false);
  });
});

describe("reasoning that arrives beside the answer", () => {
  it("keeps the working out on its own channel", async () => {
    const { deltas, thinking, result } = await collect(
      streamOf(
        chunk({ reasoning_content: "let me look" }),
        chunk({ content: "the answer" }),
        "data: [DONE]\n\n",
      ),
    );

    expect(thinking).toEqual(["let me look"]);
    expect(deltas).toEqual(["the answer"]);
    expect(result.reasoning).toBe("let me look");
    expect(result.message.content).toBe("the answer");
  });

  it.each(["reasoning_content", "reasoning", "reasoning_text"])(
    "reads reasoning from the %s field, since providers disagree",
    async (field) => {
      const { thinking } = await collect(
        streamOf(chunk({ [field]: "working" }), "data: [DONE]\n\n"),
      );

      expect(thinking).toEqual(["working"]);
    },
  );

  it("takes only the first non-empty field, so duplicated reasoning is not doubled", async () => {
    const { thinking } = await collect(
      streamOf(chunk({ reasoning_content: "once", reasoning: "once" }), "data: [DONE]\n\n"),
    );

    expect(thinking).toEqual(["once"]);
  });

  it("reports reasoning even when the model never wrote an answer", async () => {
    const { deltas, result } = await collect(
      streamOf(chunk({ reasoning_content: "thought hard" }), "data: [DONE]\n\n"),
    );

    // This is the case that produced no output at all before: the model put
    // everything in the reasoning field and the reader only looked at `content`.
    expect(deltas).toEqual([]);
    expect(result.reasoning).toBe("thought hard");
    expect(result.message.content).toBe("");
  });
});
