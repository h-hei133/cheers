import { describe, expect, it } from "vitest";
import { endpointShape, endpointTurnBody, endpointUrl } from "./index.js";
import type { TurnRequest } from "./kinds.js";

/**
 * The Google wire shape.
 *
 * What is checked is the translation between a conversation and this protocol's
 * idea of one, plus the two places the API's requirements are stricter than they
 * look: the role is called something else, and the results of one turn's calls
 * have to arrive together.
 */

const BASE: TurnRequest = {
  model: "gemini-2.5-pro",
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

/** A stream of server-sent events, each carrying one JSON chunk. */
function sseStream(...chunks: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      controller.close();
    },
  });
}

async function readAll(
  stream: ReadableStream<Uint8Array>,
): Promise<{ text: string; reasoning: string; signature?: string; calls: readonly unknown[] }> {
  const generator = endpointShape("google-generative-ai").readStream(stream);
  let step = await generator.next();
  let text = "";
  let reasoning = "";
  while (step.done !== true) {
    if (step.value.kind === "text") text += step.value.text;
    if (step.value.kind === "reasoning") reasoning += step.value.text;
    step = await generator.next();
  }
  const completion = step.value as {
    message: { tool_calls?: readonly unknown[] };
    reasoningSignature?: string;
  };
  return {
    text,
    reasoning,
    ...(completion.reasoningSignature ? { signature: completion.reasoningSignature } : {}),
    calls: completion.message.tool_calls ?? [],
  };
}

describe("the URL and headers", () => {
  it("names the model and the streaming method in the path", () => {
    expect(endpointUrl("https://generativelanguage.test", "google-generative-ai", "gemini-2.5-pro")).toBe(
      "https://generativelanguage.test/v1beta/models/gemini-2.5-pro:streamGenerateContent",
    );
  });

  it("carries the key in its own header rather than as a bearer token", () => {
    // This endpoint authenticates with a named header, which is not the shape
    // the others use — one of the reasons headers belong to the protocol.
    expect(endpointShape("google-generative-ai").headers("K")["x-goog-api-key"]).toBe("K");
  });
});

describe("the request body", () => {
  it("calls the assistant's role something else", () => {
    // Not cosmetic: this protocol has no `assistant` role, and a turn sent as one
    // is rejected.
    const body = endpointTurnBody("google-generative-ai", {
      ...BASE,
      messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }],
    });

    const contents = body.contents as ReadonlyArray<{ role: string }>;
    expect(contents.map((content) => content.role)).toEqual(["user", "model"]);
  });

  it("states the system instruction on its own", () => {
    const body = endpointTurnBody("google-generative-ai", BASE);

    expect(body.systemInstruction).toEqual({ parts: [{ text: "be helpful" }] });
  });

  it("declares tools with a JSON Schema under the name the API reads", () => {
    const body = endpointTurnBody("google-generative-ai", {
      ...BASE,
      tools: [{ type: "function", function: { name: "read", description: "d", parameters: { type: "object" } } }],
    });

    expect(body.tools).toEqual([
      { functionDeclarations: [{ name: "read", description: "d", parameters: { type: "object" } }] },
    ]);
  });

  it("omits tools entirely when the turn may not call one", () => {
    const body = endpointTurnBody("google-generative-ai", { ...BASE, allowTools: false });

    expect(body.tools).toBeUndefined();
    expect(body.toolConfig).toBeUndefined();
  });

  it("gathers the results of one turn's calls into a single turn", () => {
    // The API rejects a request whose count of response parts does not match its
    // count of call parts, and one result per turn is exactly how that happens.
    const body = endpointTurnBody("google-generative-ai", {
      ...BASE,
      messages: [
        { role: "user", content: "go" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            { id: "c1", type: "function", function: { name: "read", arguments: "{}" } },
            { id: "c2", type: "function", function: { name: "grep", arguments: "{}" } },
          ],
        },
        { role: "tool", content: "a", tool_call_id: "c1", toolName: "read" },
        { role: "tool", content: "b", tool_call_id: "c2", toolName: "grep" },
      ],
    } as never);

    const contents = body.contents as ReadonlyArray<{ role: string; parts: ReadonlyArray<Record<string, unknown>> }>;
    const userTurns = contents.filter((content) => content.role === "user");
    // The opening message and one turn holding both results.
    expect(userTurns).toHaveLength(2);
    expect(userTurns[1]!.parts).toHaveLength(2);
    expect(userTurns[1]!.parts.every((part) => "functionResponse" in part)).toBe(true);
  });

  it("names the tool a result belongs to, because that is what the API matches on", () => {
    const body = endpointTurnBody("google-generative-ai", {
      ...BASE,
      messages: [{ role: "tool", content: "x", tool_call_id: "c1", toolName: "read" }],
    } as never);

    const contents = body.contents as ReadonlyArray<{ parts: ReadonlyArray<{ functionResponse?: { name: string } }> }>;
    expect(contents[0]!.parts[0]!.functionResponse!.name).toBe("read");
  });

  it("resolves the tool name from the earlier call that it answers without toolName", () => {
    const body = endpointTurnBody("google-generative-ai", {
      ...BASE,
      messages: [
        {
          role: "assistant",
          content: "",
          tool_calls: [
            { id: "call_abc123", type: "function", function: { name: "readFile", arguments: "{}" } },
          ],
        },
        { role: "tool", content: "file content", tool_call_id: "call_abc123" },
      ],
    } as never);

    const contents = body.contents as ReadonlyArray<{ parts: ReadonlyArray<{ functionResponse?: { name: string } }> }>;
    const toolTurn = contents.find((c) => c.parts.some((p) => p.functionResponse));
    expect(toolTurn?.parts[0]?.functionResponse?.name).toBe("readFile");
  });

  it("hands signed reasoning back in the part it came from", () => {
    // Dropping or moving a signature leaves the model unable to continue its own
    // reasoning, which is why it travels with the text it covers.
    const body = endpointTurnBody("google-generative-ai", {
      ...BASE,
      messages: [
        {
          role: "assistant",
          content: "answer",
          reasoning: { text: "thought", signature: "SIG" },
        },
      ],
    });

    const contents = body.contents as ReadonlyArray<{ parts: ReadonlyArray<Record<string, unknown>> }>;
    const thought = contents[0]!.parts.find((part) => part.thought === true);
    expect(thought).toMatchObject({ text: "thought", thoughtSignature: "SIG" });
  });
});

  it("omits the temperature for a model that rejects one", () => {
    // A model that refuses a sampling temperature refuses the whole request, so
    // the caller that declares it unsupported has to get a request without one.
    // The other three protocols gate on this; Google set it unconditionally, so
    // the declaration was silently ignored on the endpoint most likely to be
    // pointed at a model with a fixed temperature.
    const body = endpointTurnBody("google-generative-ai", {
      ...BASE,
      supportsTemperature: false,
    }) as {
      generationConfig: Record<string, unknown>;
    };

    expect(body.generationConfig).not.toHaveProperty("temperature");
    // The rest of the generation config is untouched: this is one field, not a
    // different request shape.
    expect(body.generationConfig).toHaveProperty("maxOutputTokens");
  });

  it("sends the temperature when the model takes one", () => {
    const body = endpointTurnBody("google-generative-ai", BASE) as { generationConfig: Record<string, unknown> };

    expect(body.generationConfig["temperature"]).toBe(0.2);
  });

describe("reading the answer", () => {
  it("joins the text of the chunks", async () => {
    const result = await readAll(
      sseStream(
        { candidates: [{ content: { parts: [{ text: "Hel" }] } }] },
        { candidates: [{ content: { parts: [{ text: "lo" }] }, finishReason: "STOP" }] },
      ),
    );

    expect(result.text).toBe("Hello");
  });

  it("keeps a thought apart from the answer, with its signature", async () => {
    const result = await readAll(
      sseStream(
        { candidates: [{ content: { parts: [{ text: "why", thought: true, thoughtSignature: "SIG" }] } }] },
        { candidates: [{ content: { parts: [{ text: "answer" }] } }] },
      ),
    );

    expect(result.text).toBe("answer");
    expect(result.reasoning).toBe("why");
    expect(result.signature).toBe("SIG");
  });

  it("collects a tool call, which arrives whole rather than in pieces", async () => {
    const result = await readAll(
      sseStream({
        candidates: [
          { content: { parts: [{ functionCall: { name: "read", args: { path: "a" }, id: "c1" } }] } },
        ],
      }),
    );

    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]).toMatchObject({ id: "c1", function: { name: "read", arguments: '{"path":"a"}' } });
  });

  it("reads a stream framed with carriage returns", async () => {
    // The format allows it, and a reader that only looks for one separator would
    // see no events at all — silence rather than an error.
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] })}\r\n\r\n`),
        );
        controller.close();
      },
    });

    expect((await readAll(stream)).text).toBe("ok");
  });

  it("maps a safety stop reason to an error rather than a finish", async () => {
    // SAFETY means the provider refused to produce the answer, not that the
    // answer is complete. Mapping it to "stop" would end the turn cleanly on a
    // refusal the user never saw explained.
    const generator = endpointShape("google-generative-ai").readStream(
      sseStream({ candidates: [{ content: { parts: [{ text: "partial" }] }, finishReason: "SAFETY" }] }),
    );
    let step = await generator.next();
    while (step.done !== true) step = await generator.next();
    expect(step.value.finishReason).toBe("error");
  });

  it("maps MAX_TOKENS to the one reason that means truncation", async () => {
    const generator = endpointShape("google-generative-ai").readStream(
      sseStream({ candidates: [{ content: { parts: [{ text: "cut off" }] }, finishReason: "MAX_TOKENS" }] }),
    );
    let step = await generator.next();
    while (step.done !== true) step = await generator.next();
    expect(step.value.finishReason).toBe("length");
  });

  it("refuses a prompt the provider blocked", async () => {
    // The provider answered, so the transport looks healthy; without this the run
    // would report an empty answer as though the model had nothing to say.
    await expect(
      readAll(sseStream({ promptFeedback: { blockReason: "SAFETY", blockReasonMessage: "not allowed" } })),
    ).rejects.toThrow(/not allowed/);
  });

  it("reports usage under the names every other protocol uses", async () => {
    const generator = endpointShape("google-generative-ai").readStream(
      sseStream({ candidates: [{ content: { parts: [{ text: "x" }] } }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 } }),
    );
    let step = await generator.next();
    while (step.done !== true) step = await generator.next();

    expect((step.value as { usage?: unknown }).usage).toMatchObject({ prompt_tokens: 5, completion_tokens: 2 });
  });

  it("maps finishReason MAX_TOKENS to length for turn-layer truncation handling", async () => {
    const generator = endpointShape("google-generative-ai").readStream(
      sseStream({ candidates: [{ content: { parts: [{ text: "cut short" }] }, finishReason: "MAX_TOKENS" }] }),
    );
    let step = await generator.next();
    while (step.done !== true) step = await generator.next();

    expect(step.value.finishReason).toBe("length");
  });

  it("reads non-streamed body preserving functionCall tool calls and finishReason", () => {
    const shape = endpointShape("google-generative-ai");
    const body = shape.readBody({
      candidates: [
        {
          content: {
            parts: [
              { text: "calling tool" },
              { functionCall: { id: "call_1", name: "bash", args: { command: "ls" } } },
            ],
          },
          finishReason: "MAX_TOKENS",
        },
      ],
    });

    expect(body.choices?.[0]?.message?.content).toBe("calling tool");
    expect(body.choices?.[0]?.finish_reason).toBe("length");
    expect(body.choices?.[0]?.message?.tool_calls).toHaveLength(1);
    expect(body.choices?.[0]?.message?.tool_calls?.[0]).toMatchObject({
      id: "call_1",
      type: "function",
      function: { name: "bash", arguments: '{"command":"ls"}' },
    });
  });
});
