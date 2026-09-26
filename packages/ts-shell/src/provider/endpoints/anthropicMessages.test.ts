import { describe, expect, it } from "vitest";
import {
  anthropicHeaders,
  anthropicRequestBody,
  readAnthropicBody,
  readAnthropicStream,
} from "./anthropicMessages.js";

/**
 * The endpoint's own wire shape.
 *
 * These assert what goes on the wire rather than what the code does with it,
 * because the whole reason this endpoint exists is that the shapes differ: a
 * request built in the default shape is rejected by the host, and a stream read
 * in the default shape finds no text and reports an empty answer for a reply
 * that arrived complete.
 */

/** A stream that yields the given text as SSE frames. */
function sseStream(...frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
}

function event(payload: unknown): string {
  return `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
}

describe("the request this endpoint is sent", () => {
  it("carries the system instruction as its own field, not a message", () => {
    // A `system` role inside `messages` is rejected outright, so this is not a
    // preference — the request fails without it.
    const body = anthropicRequestBody({
      model: "claude-sonnet-4-5",
      systemPrompt: "You are a careful engineer.",
      messages: [{ role: "system", content: "ignored" }, { role: "user", content: "hi" }],
      tools: [],
      allowTools: false,
    });

    // A block list, not a bare string, because the stable front of every
    // request is the part worth caching and a marker has to sit on it.
    expect(body.system).toEqual([
      { type: "text", text: "You are a careful engineer.", cache_control: { type: "ephemeral" } },
    ]);
    const messages = body.messages as readonly { role: string }[];
    expect(messages.map((message) => message.role)).toEqual(["user"]);
  });

  it("always names an output ceiling, because the endpoint requires one", () => {
    // Unlike the default shape, omitting it is not an option: there is no
    // "let the host decide" here, so a number has to be sent.
    const body = anthropicRequestBody({
      model: "m",
      systemPrompt: "",
      messages: [{ role: "user", content: "hi" }],
      tools: [],
      allowTools: false,
    });

    expect(typeof body.max_tokens).toBe("number");
    expect(body.max_tokens).toBeGreaterThan(0);
  });

  it("lets the caller's ceiling win over the default", () => {
    const body = anthropicRequestBody({
      model: "m",
      systemPrompt: "",
      messages: [{ role: "user", content: "hi" }],
      tools: [],
      allowTools: false,
      maxOutputTokens: 12_345,
    });

    expect(body.max_tokens).toBe(12_345);
  });

  it("declares tools with a schema, not a nested function object", () => {
    const body = anthropicRequestBody({
      model: "m",
      systemPrompt: "",
      messages: [{ role: "user", content: "hi" }],
      tools: [
        {
          type: "function",
          function: {
            name: "read",
            description: "Read a file",
            parameters: { type: "object", properties: { path: { type: "string" } } },
          },
        },
      ],
      allowTools: true,
    });

    // The last declaration carries the cache marker: this endpoint caches up to
    // a marked block, so marking the end of the stable prefix is how the whole
    // of it is kept.
    expect(body.tools).toEqual([
      {
        name: "read",
        description: "Read a file",
        input_schema: { type: "object", properties: { path: { type: "string" } } },
        cache_control: { type: "ephemeral" },
      },
    ]);
  });

  it("sends no tools when the turn may not call any", () => {
    const body = anthropicRequestBody({
      model: "m",
      systemPrompt: "",
      messages: [{ role: "user", content: "hi" }],
      tools: [
        { type: "function", function: { name: "read", description: "d", parameters: {} } },
      ],
      allowTools: false,
    });

    expect(body.tools).toBeUndefined();
  });

  it("carries an assistant's tool call as a tool_use block", () => {
    const body = anthropicRequestBody({
      model: "m",
      systemPrompt: "",
      messages: [
        { role: "user", content: "read it" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            { id: "call-1", type: "function", function: { name: "read", arguments: '{"path":"a"}' } },
          ],
        },
      ],
      tools: [],
      allowTools: false,
    });

    const messages = body.messages as readonly { role: string; content: readonly { type: string; id?: string; name?: string; input?: unknown }[] }[];
    const assistant = messages.find((message) => message.role === "assistant");
    expect(assistant?.content).toEqual([
      { type: "tool_use", id: "call-1", name: "read", input: { path: "a" } },
    ]);
  });

  it("answers a tool result in a user turn, which is the only place it is accepted", () => {
    // There is no `tool` role in this protocol; a result travels as a block
    // inside a user turn, and two results from one turn share that turn.
    const body = anthropicRequestBody({
      model: "m",
      systemPrompt: "",
      messages: [
        { role: "tool", content: "one", tool_call_id: "call-1" },
        { role: "tool", content: "two", tool_call_id: "call-2" },
      ],
      tools: [],
      allowTools: false,
    });

    const messages = body.messages as readonly { role: string; content: readonly { type: string; tool_use_id?: string }[] }[];
    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe("user");
    expect(messages[0]?.content).toEqual([
      { type: "tool_result", tool_use_id: "call-1", content: "one" },
      { type: "tool_result", tool_use_id: "call-2", content: "two" },
    ]);
  });

  it("drops a turn that would be sent empty", () => {
    const body = anthropicRequestBody({
      model: "m",
      systemPrompt: "",
      messages: [{ role: "assistant", content: "" }],
      tools: [],
      allowTools: false,
    });

    expect(body.messages).toEqual([]);
  });
});

describe("the headers this endpoint is sent", () => {
  it("sends the key in its own header, with the version it speaks", () => {
    // A bearer token here is a request the host refuses for a reason that reads
    // like a bad key.
    const headers = anthropicHeaders("sk-test");
    expect(headers["x-api-key"]).toBe("sk-test");
    expect(headers.Authorization).toBeUndefined();
    expect(headers["anthropic-version"]).toBeTruthy();
  });
});

describe("reading this endpoint's stream", () => {
  it("assembles text from the delta events", async () => {
    const stream = readAnthropicStream(
      sseStream(
        event({ type: "message_start", message: { usage: { input_tokens: 10 } } }),
        event({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hel" } }),
        event({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "lo" } }),
        event({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2 } }),
        event({ type: "message_stop" }),
      ),
    );

    const fragments: string[] = [];
    let step = await stream.next();
    while (step.done !== true) {
      if (step.value.kind === "text") fragments.push(step.value.text);
      step = await stream.next();
    }

    expect(fragments).toEqual(["Hel", "lo"]);
    expect(step.value.message.content).toBe("Hello");
    expect(step.value.finishReason).toBe("end_turn");
  });

  it("reports usage from both halves of the stream", async () => {
    // The input side arrives on the first event and the output side on a later
    // one, so a reader that took only one of them would under-report.
    const stream = readAnthropicStream(
      sseStream(
        event({ type: "message_start", message: { usage: { input_tokens: 100, cache_read_input_tokens: 40 } } }),
        event({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 7 } }),
      ),
    );

    let step = await stream.next();
    while (step.done !== true) step = await stream.next();

    expect(step.value.usage?.prompt_tokens).toBe(100);
    expect(step.value.usage?.completion_tokens).toBe(7);
    expect(step.value.usage?.prompt_tokens_details?.cached_tokens).toBe(40);
  });

  it("assembles a tool call whose arguments arrive in fragments", async () => {
    const stream = readAnthropicStream(
      sseStream(
        event({
          type: "content_block_start",
          index: 0,
          content_block: { type: "tool_use", id: "toolu_1", name: "read" },
        }),
        event({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"pa' } }),
        event({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: 'th":"a.ts"}' } }),
        event({ type: "message_delta", delta: { stop_reason: "tool_use" } }),
      ),
    );

    let step = await stream.next();
    while (step.done !== true) step = await stream.next();

    expect(step.value.message.tool_calls).toEqual([
      { id: "toolu_1", type: "function", function: { name: "read", arguments: '{"path":"a.ts"}' } },
    ]);
    // The turn loop decides whether to continue from this word, so it has to be
    // the one the loop knows.
    expect(step.value.finishReason).toBe("tool_calls");
  });

  it("separates the working out from the answer", async () => {
    const stream = readAnthropicStream(
      sseStream(
        event({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "hmm" } }),
        event({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "answer" } }),
      ),
    );

    const kinds: string[] = [];
    let step = await stream.next();
    while (step.done !== true) {
      kinds.push(step.value.kind);
      step = await stream.next();
    }

    expect(kinds).toEqual(["reasoning", "text"]);
    expect(step.value.reasoning).toBe("hmm");
    expect(step.value.message.content).toBe("answer");
  });

  it("keeps what it already said when the stream breaks, and reports the break", async () => {
    // Two facts have to survive together. The part the user has read is worth
    // more than the failure that ended it, and the failure is still a failure:
    // returning the partial text alone would present a truncated answer as a
    // finished one, which is what this used to do.
    //
    // The chunk is pulled before the failure, which is the order a real socket
    // produces: data that arrived, then a connection that went away.
    const encoder = new TextEncoder();
    let sent = false;
    const broken = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!sent) {
          sent = true;
          controller.enqueue(
            encoder.encode(event({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "partial" } })),
          );
          return;
        }
        controller.error(new Error("connection lost"));
      },
    });

    const stream = readAnthropicStream(broken);
    let seen = "";
    await expect(async () => {
      let step = await stream.next();
      while (step.done !== true) {
        seen += step.value.text;
        step = await stream.next();
      }
    }).rejects.toThrow(/connection lost/);

    // The text still reached the caller before the failure did.
    expect(seen).toBe("partial");
  });

  it("fails when the provider reports an error in band", async () => {
    // The failure arrives as an ordinary event on a healthy stream, so nothing
    // below the event loop notices it. Unread, it left the caller with a
    // completion of zero tokens that looked exactly like a model choosing to
    // say nothing.
    const stream = readAnthropicStream(
      sseStream(
        event({ type: "message_start", message: { usage: { input_tokens: 10 } } }),
        event({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }),
      ),
    );

    await expect(async () => {
      let step = await stream.next();
      while (step.done !== true) step = await stream.next();
    }).rejects.toThrow(/Overloaded/);
  });

  it("fails when the stream ends without saying the message is complete", async () => {
    // A truncated stream is not an empty answer. With neither a stop reason nor
    // a completion event, the connection went away mid-answer and the caller has
    // to be told rather than handed the opening.
    const stream = readAnthropicStream(
      sseStream(
        event({ type: "message_start", message: { usage: { input_tokens: 10 } } }),
        event({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "half an ans" } }),
      ),
    );

    await expect(async () => {
      let step = await stream.next();
      while (step.done !== true) step = await stream.next();
    }).rejects.toThrow(/before it reported the message was complete/);
  });

  it("accepts a stream that reported its stop reason without a completion event", async () => {
    // A host in front of the API may send one signal and not the other. A stream
    // that said why it stopped was answered, and failing it would reject a
    // response that arrived.
    const stream = readAnthropicStream(
      sseStream(
        event({ type: "message_start", message: { usage: { input_tokens: 10 } } }),
        event({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "the answer" } }),
        event({ type: "message_delta", delta: { stop_reason: "end_turn" } }),
      ),
    );

    let step = await stream.next();
    while (step.done !== true) step = await stream.next();

    expect(step.value.message.content).toBe("the answer");
  });
});

describe("reading a whole-body answer", () => {
  it("takes the text out of the content blocks", () => {
    // A host that ignored `stream: true` answers with blocks, not a string;
    // reading it as the default shape finds nothing and reports an empty answer.
    const body = readAnthropicBody({
      content: [{ type: "text", text: "the answer" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 5, output_tokens: 3 },
    });

    expect(body.choices[0]?.message.content).toBe("the answer");
    expect(body.choices[0]?.finish_reason).toBe("end_turn");
    expect(body.usage?.prompt_tokens).toBe(5);
  });

  it("takes a tool call out of the blocks and reports the loop's word for it", () => {
    const body = readAnthropicBody({
      content: [{ type: "tool_use", id: "toolu_9", name: "read", input: { path: "b" } }],
      stop_reason: "tool_use",
    });

    expect(body.choices[0]?.message.tool_calls).toEqual([
      { id: "toolu_9", type: "function", function: { name: "read", arguments: '{"path":"b"}' } },
    ]);
    expect(body.choices[0]?.finish_reason).toBe("tool_calls");
  });

  it("answers nothing for a body with no content rather than throwing", () => {
    expect(readAnthropicBody({}).choices[0]?.message.content).toBe("");
  });
});

describe("a message carrying an image", () => {
  const IMAGE = { type: "image" as const, data: "aGVsbG8=", mimeType: "image/png" };

  function body(vision: boolean | undefined) {
    return anthropicRequestBody({
      model: "claude-x",
      systemPrompt: "be brief",
      messages: [{ role: "user", content: [{ type: "text", text: "look" }, IMAGE] }],
      tools: [],
      allowTools: false,
      ...(vision !== undefined ? { vision } : {}),
    });
  }

  it("sends the image as its own block", () => {
    // The endpoint takes images as blocks in the same array as the text. Sending
    // the array as one text block would ask the model to read a picture it was
    // given as the word "object".
    const blocks = (body(true).messages as Array<{ content: unknown[] }>)[0]!.content;
    expect(blocks).toContainEqual({ type: "text", text: "look" });
    expect(blocks).toContainEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "aGVsbG8=" },
    });
  });

  it("describes the image to a model that cannot read one", () => {
    // Sending the block anyway fails the whole request, which loses the text the
    // user also wrote; the description loses only what the model could not use.
    const blocks = (body(false).messages as Array<{ content: unknown[] }>)[0]!.content;
    expect(blocks).toContainEqual({ type: "text", text: "look" });
    expect(JSON.stringify(blocks)).toContain("non-vision fallback");
    expect(JSON.stringify(blocks)).not.toContain("aGVsbG8=");
  });

  it("treats an undeclared model as unable to read one", () => {
    // Absent means unknown, and unknown has to be the safe side.
    expect(JSON.stringify(body(undefined))).toContain("non-vision fallback");
  });
});
