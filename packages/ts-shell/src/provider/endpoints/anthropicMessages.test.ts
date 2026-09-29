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
    // Normalized here rather than passed through: the turn layer reads one
    // vocabulary, and `end_turn` is not a word in it.
    expect(step.value.finishReason).toBe("stop");
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

  it("fails on an error that arrives after the message was reported complete", async () => {
    // A completion event does not make a later failure not a failure. The
    // provider said the answer was done and then said something went wrong, and
    // the answer it already sent may be a prefix of the one it meant to send.
    const stream = readAnthropicStream(
      sseStream(
        event({ type: "message_start", message: { usage: { input_tokens: 10 } } }),
        event({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "half" } }),
        event({ type: "message_delta", delta: { stop_reason: "end_turn" } }),
        event({ type: "message_stop" }),
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

describe("stop reasons, in the turn layer's vocabulary", () => {
  // The turn layer decides between a delivered answer and a failure from this
  // one value, and it has no way to know which protocol spelled it. A protocol
  // that hands over its own word therefore makes every ordinary reply look like
  // an unfinished one — which is exactly what happened when `end_turn` was
  // passed through, and it failed every normal turn.
  it("reads the ordinary ending as finished, not as an unread reason", () => {
    const body = readAnthropicBody({
      content: [{ type: "text", text: "done" }],
      stop_reason: "end_turn",
    });

    expect(body.choices?.[0]?.finish_reason).toBe("stop");
  });

  it("reads truncation as length", () => {
    const body = readAnthropicBody({
      content: [{ type: "text", text: "cut" }],
      stop_reason: "max_tokens",
    });

    expect(body.choices?.[0]?.finish_reason).toBe("length");
  });

  it("reads a tool call as the loop's word for it", () => {
    const body = readAnthropicBody({
      content: [{ type: "tool_use", id: "t1", name: "read", input: { path: "a.ts" } }],
      stop_reason: "tool_use",
    });

    expect(body.choices?.[0]?.finish_reason).toBe("tool_calls");
  });

  it("leaves a reason it does not know for the turn layer to judge", () => {
    // A refusal is not a finished answer, and the mapper must not make it look
    // like one. Passing it through is what lets the turn layer treat it as the
    // unfinished answer it is.
    const body = readAnthropicBody({
      content: [],
      stop_reason: "refusal",
    });

    expect(body.choices?.[0]?.finish_reason).toBe("refusal");
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
    // The ordinary ending, in the turn layer's vocabulary.
    expect(body.choices[0]?.finish_reason).toBe("stop");
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

describe("handing the working out back", () => {
  const SIGNED = {
    role: "assistant" as const,
    content: "the answer",
    reasoning: { text: "I thought about it", signature: "sig-abc" },
  };

  function body(messages: unknown[], allowEmptySignature?: boolean) {
    return anthropicRequestBody({
      model: "claude-x",
      systemPrompt: "be brief",
      messages: messages as never,
      tools: [],
      allowTools: false,
      ...(allowEmptySignature ? { allowEmptySignature: true } : {}),
    });
  }

  function blocksOf(requestBody: Record<string, unknown>, index = 0): Array<Record<string, unknown>> {
    return (requestBody.messages as Array<{ content: Array<Record<string, unknown>> }>)[index]!.content;
  }

  it("collects the signature the provider streams after the reasoning", async () => {
    // The signature arrives as its own delta, after the text it covers, and can
    // be split across frames like everything else. A reader that only handled
    // `thinking_delta` would drop it and have nothing to hand back.
    const stream = readAnthropicStream(
      sseStream(
        event({ type: "message_start", message: { usage: { input_tokens: 10 } } }),
        event({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "I thought " } }),
        event({ type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig-" } }),
        event({ type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "abc" } }),
        event({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "the answer" } }),
        event({ type: "message_delta", delta: { stop_reason: "end_turn" } }),
      ),
    );

    let step = await stream.next();
    while (step.done !== true) step = await stream.next();

    expect(step.value.reasoning).toBe("I thought ");
    expect(step.value.reasoningSignature).toBe("sig-abc");
  });

  it("sends the signed block back ahead of the answer", () => {
    // An assistant turn that carries a tool call has to bring the signed block
    // that preceded it, or the request that supplies the tool's result is
    // refused. Order matters: it is the order the block was produced in.
    const blocks = blocksOf(body([SIGNED]));

    expect(blocks[0]).toEqual({ type: "thinking", thinking: "I thought about it", signature: "sig-abc" });
    expect(blocks[1]).toEqual({ type: "text", text: "the answer" });
  });

  it("demotes unsigned reasoning to content rather than sending it unsigned", () => {
    // An unsigned thinking block is rejected outright by a provider that
    // validates signatures. Carrying the text as ordinary content keeps the
    // reasoning reachable and the request valid.
    const blocks = blocksOf(body([{ role: "assistant", content: "the answer", reasoning: { text: "I thought" } }]));

    expect(blocks[0]).toEqual({ type: "text", text: "I thought" });
    expect(JSON.stringify(blocks)).not.toContain('"thinking"');
  });

  it("keeps the block typed as reasoning for a model that accepts an empty signature", () => {
    // A compatible endpoint that issues no signature also accepts one it did
    // not issue, so the block stays reasoning rather than being demoted.
    const blocks = blocksOf(
      body([{ role: "assistant", content: "the answer", reasoning: { text: "I thought" } }], true),
    );

    expect(blocks[0]).toEqual({ type: "thinking", thinking: "I thought", signature: "" });
  });

  it("sends nothing extra for a turn that has no reasoning", () => {
    const blocks = blocksOf(body([{ role: "assistant", content: "plain answer" }]));

    expect(blocks).toEqual([{ type: "text", text: "plain answer" }]);
  });
});

describe("the sampling settings a reasoning request may carry", () => {
  function body(overrides: Record<string, unknown>) {
    return anthropicRequestBody({
      model: "claude-x",
      systemPrompt: "be brief",
      messages: [{ role: "user", content: "hi" }],
      tools: [],
      allowTools: false,
      ...overrides,
    });
  }

  it("sends the temperature for a model that takes one", () => {
    expect(body({ temperature: 0.7 }).temperature).toBe(0.7);
  });

  it("leaves out the temperature for a model that rejects it", () => {
    // Sending a field the model refuses fails the whole request rather than
    // being ignored, so this is the difference between an answer and an error.
    expect(body({ temperature: 0.7, supportsTemperature: false })).not.toHaveProperty("temperature");
  });

  it("leaves out the temperature when the model is reasoning", () => {
    // A reasoning mode and a sampling temperature are alternatives, not
    // companions. Asking for both is a request the host refuses.
    const request = body({ temperature: 0.7, thinkingLevelName: "high" });
    expect(request).not.toHaveProperty("temperature");
  });

  it("says how much reasoning is allowed, not merely that it is on", () => {
    // The budget is required alongside `enabled`; asking for reasoning without
    // saying how much is a request the API rejects. A ceiling with room for it
    // leaves the budget at what the level asked for.
    const request = body({ thinkingLevelName: "high", thinkingBudgetTokens: 16_384, maxOutputTokens: 64_000 });

    expect(request.thinking).toEqual({ type: "enabled", budget_tokens: 16_384 });
  });

  it("uses a budget even when the caller resolved none", () => {
    const request = body({ thinkingLevelName: "high" });

    expect((request.thinking as { budget_tokens?: number }).budget_tokens).toBeGreaterThan(0);
  });

  it("fits the budget inside the caller's ceiling rather than raising it", () => {
    // The ceiling is the number the caller chose; the budget comes from the
    // reasoning level. Raising the ceiling to hold the budget let a level
    // preference override a configured output cap — with the shipped defaults
    // (`maxOutputTokens: 4096`, level `high`) every request asked for 17,408
    // tokens of output, which is not what the configuration said.
    const request = body({ thinkingLevelName: "high", thinkingBudgetTokens: 16_384, maxOutputTokens: 4_096 });

    expect(request.max_tokens).toBe(4_096);
    expect((request.thinking as { budget_tokens: number }).budget_tokens).toBeLessThan(4_096);
  });

  it("omits thinking when the ceiling cannot hold a budget and an answer", () => {
    // The API rejects a budget that leaves no room to answer. The answer is what
    // the caller asked for, so the reasoning is the part that goes.
    const request = body({ thinkingLevelName: "high", thinkingBudgetTokens: 16_384, maxOutputTokens: 1_500 });

    expect(request).not.toHaveProperty("thinking");
    expect(request.max_tokens).toBe(1_500);
  });

  it("leaves a caller's ceiling alone when it already has room", () => {
    const request = body({ thinkingLevelName: "low", thinkingBudgetTokens: 2_048, maxOutputTokens: 64_000 });

    expect(request.max_tokens).toBe(64_000);
  });

  it("sends no thinking field at all when no level was asked for", () => {
    expect(body({ temperature: 0.7 })).not.toHaveProperty("thinking");
  });
});

describe("a stream framed with CRLF", () => {
  /**
   * The event-stream format allows CRLF as the separator, and a reader that only
   * looks for `\n\n` never finds a boundary in such a stream: the buffer grows
   * until the connection closes and the run sees no output at all — not an
   * error, just silence, which is the worse of the two.
   */
  it("finds the events", async () => {
    const encoder = new TextEncoder();
    const crlf = (payload: unknown) =>
      `event: message\r\ndata: ${JSON.stringify(payload)}\r\n\r\n`;
    const stream = readAnthropicStream(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(crlf({ type: "message_start", message: { usage: {} } })));
          controller.enqueue(
            encoder.encode(crlf({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "hi" } })),
          );
          controller.enqueue(encoder.encode(crlf({ type: "message_stop" })));
          controller.close();
        },
      }),
    );

    const fragments: string[] = [];
    let step = await stream.next();
    while (step.done !== true) {
      if (step.value.kind === "text") fragments.push(step.value.text);
      step = await stream.next();
    }
    expect(fragments.join("")).toBe("hi");
  });
});

describe("reasoning the provider withholds", () => {
  /**
   * A `redacted_thinking` block is not ours to read, but it is a signed block
   * like any other: the request that supplies a tool's result has to bring it
   * back, or the provider refuses. Dropping it loses the trajectory; sending it
   * as a `thinking` block presents withheld text as ours and is rejected too.
   */
  it("is captured with its payload and marked as withheld", async () => {
    const stream = readAnthropicStream(
      sseStream(
        event({ type: "message_start", message: { usage: {} } }),
        event({ type: "content_block_start", index: 0, content_block: { type: "redacted_thinking", data: "OPAQUE" } }),
        event({ type: "message_stop" }),
      ),
    );
    let step = await stream.next();
    while (step.done !== true) step = await stream.next();
    const completion = step.value as { reasoningSignature?: string; reasoningRedacted?: boolean };

    expect(completion.reasoningSignature).toBe("OPAQUE");
    expect(completion.reasoningRedacted).toBe(true);
  });

  it("goes back as a redacted block, not as ordinary reasoning", () => {
    const body = anthropicRequestBody({
      model: "claude-sonnet-4-5",
      systemPrompt: "s",
      messages: [
        {
          role: "assistant",
          content: "working",
          reasoning: { text: "[reasoning withheld by the provider]", signature: "OPAQUE", redacted: true },
        },
        { role: "user", content: "continue" },
      ],
    });
    const blocks = (body.messages as Array<{ content: Array<{ type: string; data?: string }> }>)[0]!.content;
    const redacted = blocks.find((block) => block.type === "redacted_thinking");

    expect(redacted).toBeDefined();
    expect(redacted!.data).toBe("OPAQUE");
  });
});
