import { describe, expect, it } from "vitest";
import {
  isEventStream,
  readCompletionStream,
  type StreamedCompletion,
} from "./completion.js";

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

describe("hosts that disagree with the wire contract", () => {
  it("keeps the name a host sent once and then re-sent as an empty string", async () => {
    // The shape a real DeepSeek host streams: the opening entry carries id, type
    // and name; every argument chunk after it repeats the keys as `""` and `null`.
    // Reading those as values erased the name, the assembled call was dropped as
    // nameless, and the turn ended with no answer and no tool run.
    const { result } = await collect(
      streamOf(
        chunk({ tool_calls: [{ index: 0, id: "abc", type: "function", function: { name: "bash", arguments: "" } }] }),
        chunk({ tool_calls: [{ index: 0, id: null, type: null, function: { name: "", arguments: '{"comm' } }] }),
        chunk({ tool_calls: [{ index: 0, id: null, type: null, function: { name: "", arguments: 'and":"ls"}' } }] }),
        "data: [DONE]\n\n",
      ),
    );

    expect(result.message.tool_calls).toEqual([
      { id: "abc", type: "function", function: { name: "bash", arguments: '{"command":"ls"}' } },
    ]);
  });

  it("continues a call from a host that keys nothing after the first entry", async () => {
    const { result } = await collect(
      streamOf(
        chunk({ tool_calls: [{ id: "a", function: { name: "read", arguments: "{" } }] }),
        chunk({ tool_calls: [{ function: { arguments: '"path":"x"}' } }] }),
        "data: [DONE]\n\n",
      ),
    );

    expect(result.message.tool_calls).toEqual([
      { id: "a", type: "function", function: { name: "read", arguments: '{"path":"x"}' } },
    ]);
  });

  it("routes an unkeyed multi-entry array by position, so siblings stay apart", async () => {
    const { result } = await collect(
      streamOf(
        chunk({ tool_calls: [{ function: { name: "read", arguments: "{" } }, { function: { name: "grep", arguments: "[" } }] }),
        chunk({ tool_calls: [{ function: { arguments: "}" } }, { function: { arguments: "]" } }] }),
        "data: [DONE]\n\n",
      ),
    );

    expect(result.message.tool_calls?.map((call) => [call.function.name, call.function.arguments])).toEqual([
      ["read", "{}"],
      ["grep", "[]"],
    ]);
  });

  it("accepts arguments streamed as an object instead of a JSON string", async () => {
    const { result } = await collect(
      streamOf(
        chunk({ tool_calls: [{ index: 0, id: "a", function: { name: "write", arguments: { path: "x.ts" } } }] }),
        chunk({ tool_calls: [{ index: 0, function: { arguments: { path: "x.ts", body: "hello" } } }] }),
        "data: [DONE]\n\n",
      ),
    );

    expect(JSON.parse(result.message.tool_calls![0]!.function.arguments)).toEqual({
      path: "x.ts",
      body: "hello",
    });
  });

  it("orders calls by index even when the host sends them out of order", async () => {
    const { result } = await collect(
      streamOf(
        chunk({ tool_calls: [{ index: 1, id: "second", function: { name: "grep", arguments: "{}" } }] }),
        chunk({ tool_calls: [{ index: 0, id: "first", function: { name: "read", arguments: "{}" } }] }),
        "data: [DONE]\n\n",
      ),
    );

    expect(result.message.tool_calls?.map((call) => call.id)).toEqual(["first", "second"]);
  });

  it("reads events separated by CRLF, which a proxy in the path can introduce", async () => {
    const { deltas } = await collect(
      streamOf('data: {"choices":[{"delta":{"content":"ok"}}]}\r\n\r\n', "data: [DONE]\r\n\r\n"),
    );

    expect(deltas).toEqual(["ok"]);
  });

  it("reads a final event the host never terminated with a blank line", async () => {
    const { deltas, result } = await collect(
      streamOf(chunk({ content: "first" }), 'data: {"choices":[{"delta":{"content":"last"}}]}'),
    );

    expect(deltas).toEqual(["first", "last"]);
    expect(result.message.content).toBe("firstlast");
  });
});

describe("chat-template markers that leak into visible text", () => {
  it("drops a marker without touching the prose around it", async () => {
    const { deltas, result } = await collect(
      streamOf(chunk({ content: "before<｜tool_calls_begin｜>after" }), "data: [DONE]\n\n"),
    );

    expect(deltas).toEqual(["beforeafter"]);
    expect(result.message.content).toBe("beforeafter");
  });

  it("holds back a marker split across two deltas rather than showing half of it", async () => {
    const { deltas } = await collect(
      streamOf(chunk({ content: "text<｜end▁of" }), chunk({ content: "▁sentence｜>tail" }), "data: [DONE]\n\n"),
    );

    expect(deltas).toEqual(["text", "tail"]);
  });

  it("releases a held partial that turned out to be ordinary text", async () => {
    const { deltas, result } = await collect(streamOf(chunk({ content: "if a <" }), "data: [DONE]\n\n"));

    expect(deltas.join("")).toBe("if a <");
    expect(result.message.content).toBe("if a <");
  });

  it("leaves tool-call markup with attributes alone, since the loop parses it", async () => {
    const markup = '<｜DSML｜invoke name="read">x</｜DSML｜invoke>';
    const { result } = await collect(streamOf(chunk({ content: markup }), "data: [DONE]\n\n"));

    expect(result.message.content).toBe(markup);
  });
});

describe("a stream that ends without its sentinel", () => {
  /** A body that yields the given events and then stays open, never closing. */
  function openStream(...events: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        for (const event of events) controller.enqueue(encoder.encode(event));
        // Deliberately not closed: a keep-alive host holds the connection.
      },
    });
  }

  it("finishes on the terminal reason instead of waiting for [DONE]", async () => {
    const started = Date.now();
    const { deltas, result } = await collect(
      openStream(
        chunk({ content: "Answer" }),
        chunk({}, { finish_reason: "stop" }),
      ),
    );

    // Before this was handled the reader waited for a close that never came, and
    // the turn ran forever.
    expect(deltas).toEqual(["Answer"]);
    expect(result.message.content).toBe("Answer");
    expect(result.finishReason).toBe("stop");
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("still collects usage reported after the terminal reason", async () => {
    const encoder = new TextEncoder();
    let sent = 0;
    const usageChunk = () =>
      `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 42, completion_tokens: 7, total_tokens: 49 } })}\n\n`;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(chunk({ content: "Hi" })));
        controller.enqueue(encoder.encode(chunk({}, { finish_reason: "stop" })));
        setTimeout(() => {
          sent += 1;
          controller.enqueue(encoder.encode(usageChunk()));
        }, 50);
      },
    });

    const { result } = await collect(body);
    // The grace window exists for exactly this: usage arrives after the reason.
    expect(sent).toBe(1);
    expect(result.usage?.prompt_tokens).toBe(42);
  });

  it("finishes a tool-call turn the same way", async () => {
    const { result } = await collect(
      openStream(
        chunk({ tool_calls: [{ index: 0, id: "call_1", function: { name: "bash", arguments: "{}" } }] }),
        chunk({}, { finish_reason: "tool_calls" }),
      ),
    );

    expect(result.finishReason).toBe("tool_calls");
    expect(result.message.tool_calls?.[0]?.function.name).toBe("bash");
  });
});
