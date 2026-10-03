import { describe, expect, it } from "vitest";
import { endpointShape, endpointTurnBody, endpointUrl } from "./index.js";
import { crc32 } from "../aws/eventStream.js";
import type { TurnRequest } from "./kinds.js";

/**
 * The Bedrock wire shape.
 *
 * What is checked here is the shape of what goes out and what comes back — the
 * parts a protocol owns. The signature and the binary framing have their own
 * tests; this file is about the translation between a conversation and this
 * protocol's idea of one.
 */

const BASE: TurnRequest = {
  model: "anthropic.claude-3",
  systemPrompt: "be helpful",
  messages: [{ role: "user", content: "hello" }],
  tools: [],
  allowTools: true,
  vision: false,
  temperature: 0.2,
  maxOutputTokens: 512,
  systemRole: "system",
  reasoningEffort: false,
  maxTokensField: "max_tokens",
  assistantAfterToolResult: false,
};

/** One event message, framed and checksummed as the protocol requires. */
function event(name: string, payload: unknown): Uint8Array {
  const headerBytes: number[] = [];
  const encoder = new TextEncoder();
  for (const [key, value] of [
    [":message-type", "event"],
    [":event-type", name],
  ] as const) {
    const name_ = encoder.encode(key);
    const value_ = encoder.encode(value);
    headerBytes.push(name_.length, ...name_, 7, value_.length >> 8, value_.length & 0xff, ...value_);
  }
  const payloadBytes = [...encoder.encode(JSON.stringify(payload))];
  const total = 12 + headerBytes.length + payloadBytes.length + 4;
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, total, false);
  view.setUint32(4, headerBytes.length, false);
  view.setUint32(8, crc32(bytes.subarray(0, 8)), false);
  bytes.set(headerBytes, 12);
  bytes.set(payloadBytes, 12 + headerBytes.length);
  view.setUint32(total - 4, crc32(bytes.subarray(0, total - 4)), false);
  return bytes;
}

/** A stream carrying the given frames. */
function streamOf(...frames: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(frame);
      controller.close();
    },
  });
}

async function readAll(frames: Uint8Array[]): Promise<{ text: string; reasoning: string; calls: unknown[]; finish?: string }> {
  const stream = endpointShape("bedrock-converse-stream").readStream(streamOf(...frames));
  let step = await stream.next();
  let text = "";
  while (step.done !== true) {
    if (step.value.kind === "text") text += step.value.text;
    step = await stream.next();
  }
  const completion = step.value as {
    message: { tool_calls?: readonly unknown[] };
    reasoning?: string;
    finishReason?: string;
  };
  return {
    text,
    reasoning: completion.reasoning ?? "",
    calls: [...(completion.message.tool_calls ?? [])],
    ...(completion.finishReason ? { finish: completion.finishReason } : {}),
  };
}

describe("the URL and headers", () => {
  it("names the model in the path", () => {
    // This is the protocol that made the path a function: the model is not in
    // the body here, so the resource depends on it.
    expect(endpointUrl("https://bedrock.test", "bedrock-converse-stream", "anthropic.claude-3")).toBe(
      "https://bedrock.test/model/anthropic.claude-3/converse-stream",
    );
  });

  it("encodes a model identifier that needs it", () => {
    expect(endpointUrl("https://bedrock.test", "bedrock-converse-stream", "a/b")).toBe(
      "https://bedrock.test/model/a%2Fb/converse-stream",
    );
  });

  it("asks for the binary event stream", () => {
    expect(endpointShape("bedrock-converse-stream").headers("k").accept).toBe("application/vnd.amazon.eventstream");
  });
});

describe("the request body", () => {
  it("carries the system instruction as blocks rather than a role", () => {
    const body = endpointTurnBody("bedrock-converse-stream", BASE);

    expect(body.system).toEqual([{ text: "be helpful" }]);
    expect(JSON.stringify(body.messages)).not.toContain("be helpful");
  });

  it("always states a token ceiling, because this protocol has no default", () => {
    const body = endpointTurnBody("bedrock-converse-stream", { ...BASE, maxOutputTokens: undefined });

    expect((body.inferenceConfig as Record<string, unknown>).maxTokens).toBeDefined();
  });

  it("omits a temperature a reasoning model would reject", () => {
    const withThinking = endpointTurnBody("bedrock-converse-stream", { ...BASE, thinkingLevelName: "high" });

    expect((withThinking.inferenceConfig as Record<string, unknown>).temperature).toBeUndefined();
  });

  it("wraps tools the way this protocol names them", () => {
    const body = endpointTurnBody("bedrock-converse-stream", {
      ...BASE,
      tools: [{ type: "function", function: { name: "read", description: "d", parameters: { type: "object" } } }],
    });

    expect(body.toolConfig).toEqual({
      tools: [{ toolSpec: { name: "read", description: "d", inputSchema: { json: { type: "object" } } } }],
      toolChoice: { auto: {} },
    });
  });

  it("declares a placeholder tool when the history shows one but none is offered", () => {
    // The protocol rejects a request whose history carries a tool call or result
    // unless it also carries a tool configuration, and it has no way to say
    // "none". The placeholder is never callable: the model is told to answer.
    const body = endpointTurnBody("bedrock-converse-stream", {
      ...BASE,
      allowTools: false,
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "read", arguments: "{}" } }] },
        { role: "tool", content: "contents", tool_call_id: "c1" },
      ],
    });

    const config = body.toolConfig as { tools: ReadonlyArray<{ toolSpec: { name: string } }> };
    expect(config.tools).toHaveLength(1);
    expect(config.tools[0]!.toolSpec.name).toBe("__no_tools__");
  });

  it("omits the tool configuration entirely when nothing refers to a tool", () => {
    // Sending the placeholder on an ordinary turn would offer a tool for no
    // reason, which is worse than omitting a field.
    const body = endpointTurnBody("bedrock-converse-stream", { ...BASE, allowTools: false, tools: [] });

    expect(body.toolConfig).toBeUndefined();
  });

  it("puts a tool's result in the same turn as the text around it", () => {
    // Turns alternate, and the content of a turn is a list. Emitting a result as
    // a turn of its own would produce two user turns in a row, which is not a
    // shape this protocol accepts.
    const body = endpointTurnBody("bedrock-converse-stream", {
      ...BASE,
      messages: [
        { role: "tool", content: "a", tool_call_id: "c1" },
        { role: "tool", content: "b", tool_call_id: "c2" },
      ],
    });

    const messages = body.messages as ReadonlyArray<{ role: string; content: ReadonlyArray<Record<string, unknown>> }>;
    expect(messages).toHaveLength(1);
    expect(messages[0]!.role).toBe("user");
    expect(messages[0]!.content).toHaveLength(2);
    expect(messages[0]!.content.every((block) => "toolResult" in block)).toBe(true);
  });
});

describe("a message with an image", () => {
  it("sends the image as its own block rather than its description", () => {
    // Flattening to text would send a request the model reads as a
    // description of a picture it cannot see. The picture has to arrive.
    const body = endpointTurnBody("bedrock-converse-stream", {
      ...BASE,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "what is in this" },
            { type: "image", mimeType: "image/png", data: "aW1hZ2U=" },
          ],
        },
      ],
    });
    const messages = body.messages as ReadonlyArray<{ content: ReadonlyArray<Record<string, unknown>> }>;
    const kinds = messages[0]!.content.map((block) => Object.keys(block)[0]);
    expect(kinds).toEqual(["text", "image"]);
    const image = messages[0]!.content[1]!.image as { format: string; source: { bytes: string } };
    expect(image.format).toBe("png");
    expect(image.source.bytes).toBe("aW1hZ2U=");
  });

  it("maps a JPEG MIME type to the format name this protocol expects", () => {
    const body = endpointTurnBody("bedrock-converse-stream", {
      ...BASE,
      messages: [
        {
          role: "user",
          content: [{ type: "image", mimeType: "image/jpg", data: "aW1hZ2U=" }],
        },
      ],
    });
    const messages = body.messages as ReadonlyArray<{ content: ReadonlyArray<Record<string, unknown>> }>;
    const image = messages[0]!.content[0]!.image as { format: string };
    expect(image.format).toBe("jpeg");
  });

  it("names an image type this protocol cannot carry instead of sending it", () => {
    // Reading the MIME subtype as the format produced `svg+xml` for an SVG, and
    // the API then rejected the whole request naming a field the user never set.
    // The picture is still lost, but the reason is where the picture was.
    const body = endpointTurnBody("bedrock-converse-stream", {
      ...BASE,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "look at this" },
            { type: "image", mimeType: "image/svg+xml", data: "aW1hZ2U=" },
          ],
        },
      ],
    });

    const messages = body.messages as ReadonlyArray<{ content: ReadonlyArray<Record<string, unknown>> }>;
    const blocks = messages[0]!.content;
    expect(blocks.some((block) => "image" in block)).toBe(false);
    expect(blocks.map((block) => block["text"]).join(" ")).toContain("image/svg+xml");
    // The words beside the picture survive, which is the same rule the unknown
    // block shape follows.
    expect(blocks.map((block) => block["text"]).join(" ")).toContain("look at this");
  });

  it("sends the four formats the protocol accepts", () => {
    for (const [mimeType, expected] of [
      ["image/png", "png"],
      ["image/jpeg", "jpeg"],
      ["image/gif", "gif"],
      ["image/webp", "webp"],
    ] as const) {
      const body = endpointTurnBody("bedrock-converse-stream", {
        ...BASE,
        messages: [{ role: "user", content: [{ type: "image", mimeType, data: "aW1hZ2U=" }] }],
      });
      const messages = body.messages as ReadonlyArray<{ content: ReadonlyArray<Record<string, unknown>> }>;
      const image = messages[0]!.content[0]!.image as { format: string };
      expect(image.format, mimeType).toBe(expected);
    }
  });

  it("carries the text beside the image, which flattening would have dropped", () => {
    const body = endpointTurnBody("bedrock-converse-stream", {
      ...BASE,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "look at this" },
            { type: "image", mimeType: "image/png", data: "aW1hZ2U=" },
          ],
        },
      ],
    });
    const messages = body.messages as ReadonlyArray<{ content: ReadonlyArray<Record<string, unknown>> }>;
    expect(messages[0]!.content[0]).toEqual({ text: "look at this" });
  });

  it("carries a thinking budget in the protocol's own field, not the sampling settings", () => {
    const body = endpointTurnBody("bedrock-converse-stream", {
      ...BASE,
      thinkingBudgetTokens: 4096,
    }) as { additionalModelRequestFields?: { thinking?: { type: string; budget_tokens: number } } };
    expect(body.additionalModelRequestFields?.thinking).toEqual({ type: "enabled", budget_tokens: 4096 });
  });

  it("omits the thinking field when no budget was configured", () => {
    const body = endpointTurnBody("bedrock-converse-stream", BASE) as { additionalModelRequestFields?: unknown };
    expect(body.additionalModelRequestFields).toBeUndefined();
  });
});

describe("reading the answer", () => {
  it("joins the text fragments", async () => {
    const result = await readAll([
      event("messageStart", { role: "assistant" }),
      event("contentBlockDelta", { contentBlockIndex: 0, delta: { text: "Hel" } }),
      event("contentBlockDelta", { contentBlockIndex: 0, delta: { text: "lo" } }),
      event("messageStop", { stopReason: "end_turn" }),
    ]);

    expect(result.text).toBe("Hello");
  });

  it("keeps reasoning apart from the answer, with its signature", async () => {
    const stream = endpointShape("bedrock-converse-stream").readStream(
      streamOf(
        event("messageStart", { role: "assistant" }),
        event("contentBlockDelta", { contentBlockIndex: 0, delta: { reasoningContent: { text: "thinking" } } }),
        event("contentBlockDelta", { contentBlockIndex: 0, delta: { reasoningContent: { signature: "SIG" } } }),
        event("contentBlockDelta", { contentBlockIndex: 1, delta: { text: "answer" } }),
        event("messageStop", { stopReason: "end_turn" }),
      ),
    );
    let step = await stream.next();
    while (step.done !== true) step = await stream.next();
    const completion = step.value as { message: { content: string }; reasoning: string; reasoningSignature?: string };

    expect(completion.message.content).toBe("answer");
    expect(completion.reasoning).toBe("thinking");
    // The signature has to travel back with the text it covers, or the next
    // request in the trajectory is refused.
    expect(completion.reasoningSignature).toBe("SIG");
  });

  it("collects a tool call whose arguments arrive in pieces", async () => {
    const result = await readAll([
      event("messageStart", { role: "assistant" }),
      event("contentBlockStart", { contentBlockIndex: 0, start: { toolUse: { toolUseId: "t1", name: "read" } } }),
      event("contentBlockDelta", { contentBlockIndex: 0, delta: { toolUse: { input: '{"pa' } } }),
      event("contentBlockDelta", { contentBlockIndex: 0, delta: { toolUse: { input: 'th":"a"}' } } }),
      event("messageStop", { stopReason: "tool_use" }),
    ]);

    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]).toMatchObject({ id: "t1", function: { name: "read", arguments: '{"path":"a"}' } });
  });

  it("reports usage under the names every other protocol uses", async () => {
    const stream = endpointShape("bedrock-converse-stream").readStream(
      streamOf(
        event("messageStart", { role: "assistant" }),
        event("metadata", { usage: { inputTokens: 7, outputTokens: 3 } }),
        event("messageStop", { stopReason: "end_turn" }),
      ),
    );
    let step = await stream.next();
    while (step.done !== true) step = await stream.next();

    expect((step.value as { usage?: unknown }).usage).toMatchObject({ prompt_tokens: 7, completion_tokens: 3 });
  });

  it("refuses a stream that started and never finished", async () => {
    // A truncated answer returned as though it were whole is the failure being
    // avoided: the caller cannot tell the difference from the text alone.
    await expect(
      readAll([
        event("messageStart", { role: "assistant" }),
        event("contentBlockDelta", { contentBlockIndex: 0, delta: { text: "half" } }),
      ]),
    ).rejects.toThrow(/before it reported the message was complete/);
  });

  it.each([false, true])("rejects EOF without messageStop even when messageStart is absent (content=%s)", async content => {
    const stream = endpointShape("bedrock-converse-stream").readStream(streamOf(...(content
      ? [event("contentBlockDelta", { contentBlockIndex: 0, delta: { text: "partial" } })] : [])));
    if (content) expect(await stream.next()).toEqual({ done: false, value: { kind: "text", text: "partial" } });
    await expect(stream.next()).rejects.toThrow(/before it reported the message was complete/);
  });

  it("accepts a messageStop without messageStart and retains following usage", async () => {
    const stream = endpointShape("bedrock-converse-stream").readStream(streamOf(
      event("contentBlockDelta", { contentBlockIndex: 0, delta: { text: "complete" } }),
      event("messageStop", { stopReason: "end_turn" }),
      event("metadata", { usage: { inputTokens: 9, outputTokens: 2 } }),
    ));
    expect((await stream.next()).value).toEqual({ kind: "text", text: "complete" });
    expect(await stream.next()).toMatchObject({ done: true, value: {
      finishReason: "stop", message: { content: "complete" }, usage: { prompt_tokens: 9, completion_tokens: 2 },
    } });
  });

  it("reports a failure the provider sent in band", async () => {
    // The transport succeeded, so this is the only place the failure is visible.
    const bytes = (() => {
      const encoder = new TextEncoder();
      const headerBytes: number[] = [];
      for (const [key, value] of [
        [":message-type", "exception"],
        [":exception-type", "ThrottlingException"],
      ] as const) {
        const name = encoder.encode(key);
        const val = encoder.encode(value);
        headerBytes.push(name.length, ...name, 7, val.length >> 8, val.length & 0xff, ...val);
      }
      const payloadBytes = [...encoder.encode("slow down")];
      const total = 12 + headerBytes.length + payloadBytes.length + 4;
      const out = new Uint8Array(total);
      const view = new DataView(out.buffer);
      view.setUint32(0, total, false);
      view.setUint32(4, headerBytes.length, false);
      view.setUint32(8, crc32(out.subarray(0, 8)), false);
      out.set(headerBytes, 12);
      out.set(payloadBytes, 12 + headerBytes.length);
      view.setUint32(total - 4, crc32(out.subarray(0, total - 4)), false);
      return out;
    })();

    await expect(readAll([bytes])).rejects.toThrow(/ThrottlingException/);
  });
});

describe("a failure that arrives in the stream", () => {
  /** One exception message, framed the way the protocol frames them. */
  function exception(name: string, payload: unknown): Uint8Array {
    const headerBytes: number[] = [];
    const encoder = new TextEncoder();
    for (const [key, value] of [
      [":message-type", "exception"],
      [":exception-type", name],
    ] as const) {
      const name_ = encoder.encode(key);
      const value_ = encoder.encode(value);
      headerBytes.push(name_.length, ...name_, 7, value_.length >> 8, value_.length & 0xff, ...value_);
    }
    const payloadBytes = [...encoder.encode(JSON.stringify(payload))];
    const total = 12 + headerBytes.length + payloadBytes.length + 4;
    const bytes = new Uint8Array(total);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, total, false);
    view.setUint32(4, headerBytes.length, false);
    view.setUint32(8, crc32(bytes.subarray(0, 8)), false);
    bytes.set(headerBytes, 12);
    bytes.set(payloadBytes, 12 + headerBytes.length);
    view.setUint32(total - 4, crc32(bytes.subarray(0, total - 4)), false);
    return bytes;
  }

  /**
   * It ends the read rather than being noticed at the end of it.
   *
   * An exception frame is terminal: the answer is already known to be unusable.
   * Continuing to consume the stream spends the connection on bytes that cannot
   * change the outcome, and holds the failure back until the provider decides to
   * close — which is exactly the case where something has gone wrong upstream and
   * nothing is coming.
   */
  it("is raised without reading the rest of the stream", async () => {
    const stream = endpointShape("bedrock-converse-stream").readStream(
      streamOf(
        exception("ValidationException", { message: "the model id is not valid" }),
        event("contentBlockDelta", { delta: { text: "never reached" } }),
      ),
    );

    await expect(stream.next()).rejects.toThrow(/ValidationException/);
  });

  it("carries the provider's own words", async () => {
    const stream = endpointShape("bedrock-converse-stream").readStream(
      streamOf(exception("ThrottlingException", { message: "too many requests" })),
    );

    await expect(stream.next()).rejects.toThrow(/too many requests/);
  });
});

describe("the bedrock signer", () => {
  it("signs the authority including a gateway's non-default port", async () => {
    const saved = { ...process.env };
    Object.assign(process.env, { AWS_ACCESS_KEY_ID: "PORT_KEY", AWS_SECRET_ACCESS_KEY: "synthetic-secret" });
    try {
      const shape = endpointShape("bedrock-converse-stream");
      const signer = await shape.signer!();
      const signed = await signer!({ url: "https://gateway.test:8443/model/m1/converse", method: "POST", headers: {}, body: "{}" });
      expect(signed.host).toBe("gateway.test:8443");
    } finally {
      for (const name of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]) delete process.env[name];
      Object.assign(process.env, saved);
    }
  });

  it("derives the signing region from the host when the host names one", async () => {
    const saved = { ...process.env };
    Object.assign(process.env, {
      AWS_ACCESS_KEY_ID: "AKIDEXAMPLE",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_REGION: "us-east-1",
    });
    try {
      const shape = endpointShape("bedrock-converse-stream");
      const signer = await shape.signer!();
      const signed = await signer!({
        url: "https://bedrock-runtime.eu-west-1.amazonaws.com/model/m1/converse-stream",
        method: "POST",
        headers: shape.headers(""),
        body: "{}",
      });

      expect(signed.authorization).toContain("/eu-west-1/bedrock-runtime/aws4_request");
    } finally {
      for (const name of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"]) delete process.env[name];
      Object.assign(process.env, saved);
    }
  });

  it("re-resolves credentials per request rather than capturing them once", async () => {
    const saved = { ...process.env };
    Object.assign(process.env, {
      AWS_ACCESS_KEY_ID: "FIRST_KEY",
      AWS_SECRET_ACCESS_KEY: "secret1",
      AWS_REGION: "us-east-1",
    });
    try {
      const shape = endpointShape("bedrock-converse-stream");
      const signer = await shape.signer!();

      const firstSigned = await signer!({
        url: "https://bedrock-runtime.us-east-1.amazonaws.com/model/m1/converse-stream",
        method: "POST",
        headers: shape.headers(""),
        body: "{}",
      });
      expect(firstSigned.authorization).toContain("Credential=FIRST_KEY/");

      process.env.AWS_ACCESS_KEY_ID = "SECOND_KEY";
      process.env.AWS_SECRET_ACCESS_KEY = "secret2";

      const secondSigned = await signer!({
        url: "https://bedrock-runtime.us-east-1.amazonaws.com/model/m1/converse-stream",
        method: "POST",
        headers: shape.headers(""),
        body: "{}",
      });
      expect(secondSigned.authorization).toContain("Credential=SECOND_KEY/");
    } finally {
      for (const name of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"]) delete process.env[name];
      Object.assign(process.env, saved);
    }
  });
});
