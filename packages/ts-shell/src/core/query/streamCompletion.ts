/**
 * Reading a chat completion as it arrives.
 *
 * A completion read with one `json()` call cannot be shown until the model has
 * finished writing it, which for a long answer is the difference between a cursor
 * that moves and a terminal that looks hung. Asking for `stream: true` costs
 * nothing and lets the answer appear as it is written.
 *
 * The stream is reassembled into exactly the shape a non-streaming response has,
 * so everything downstream — tool calls, DSML extraction, message history — is
 * unchanged by the switch. That is the point: streaming is a delivery detail, not
 * a second code path with its own bugs.
 */

export interface StreamedToolCall {
  readonly id: string;
  readonly type: "function";
  readonly function: { name: string; arguments: string };
}

export interface StreamedCompletion {
  /** Assembled message, shaped like `choices[0].message`. */
  readonly message: {
    readonly role: "assistant";
    readonly content: string;
    readonly tool_calls?: readonly StreamedToolCall[];
  };
  readonly finishReason?: string;
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
    readonly total_tokens?: number;
  };
}

interface DeltaChunk {
  readonly choices?: readonly {
    readonly delta?: {
      readonly content?: string | null;
      readonly reasoning_content?: string | null;
      readonly tool_calls?: readonly {
        readonly index?: number;
        readonly id?: string;
        readonly function?: { readonly name?: string; readonly arguments?: string };
      }[];
    };
    readonly finish_reason?: string | null;
  }[];
  readonly usage?: StreamedCompletion["usage"];
}

/** Whether a response body is a server-sent event stream we can read. */
export function isEventStream(response: { readonly headers: Headers; readonly body: unknown }): boolean {
  const type = response.headers.get("content-type") ?? "";
  return type.includes("text/event-stream") && response.body !== null;
}

/**
 * Consume an SSE completion, yielding each text fragment as it arrives and
 * returning the assembled message.
 *
 * Tool call arguments arrive split across chunks and keyed by index, not by id,
 * so they are accumulated per index and only assembled at the end — a partially
 * received argument string is not valid JSON and must never be handed on.
 */
export async function* readCompletionStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string, StreamedCompletion, undefined> {
  const decoder = new TextDecoder();
  const calls = new Map<number, { id?: string; name: string; args: string }>();
  let content = "";
  let finishReason: string | undefined;
  let usage: StreamedCompletion["usage"];
  let buffer = "";

  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    // Events are separated by a blank line; a partial event stays in the buffer.
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
      const payload = eventData(event);
      if (payload === undefined) continue;
      if (payload === "[DONE]") break;
      const parsed = parseChunk(payload);
      if (!parsed) continue;
      if (parsed.usage) usage = parsed.usage;
      const choice = parsed.choices?.[0];
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      const delta = choice?.delta;
      if (!delta) continue;
      for (const call of delta.tool_calls ?? []) {
        const index = call.index ?? 0;
        const existing = calls.get(index) ?? { name: "", args: "" };
        calls.set(index, {
          id: call.id ?? existing.id,
          name: call.function?.name ?? existing.name,
          args: existing.args + (call.function?.arguments ?? ""),
        });
      }
      if (delta.content) {
        content += delta.content;
        yield delta.content;
      }
    }
  }

  const toolCalls = [...calls.entries()]
    .sort(([left], [right]) => left - right)
    .filter(([, call]) => call.name.length > 0)
    .map(([index, call]) => ({
      id: call.id ?? `call_stream_${index}`,
      type: "function" as const,
      function: { name: call.name, arguments: call.args },
    }));

  return {
    message: {
      role: "assistant",
      content,
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    },
    finishReason,
    usage,
  };
}

/** The `data:` payload of one event, or undefined for comments and keep-alives. */
function eventData(event: string): string | undefined {
  const lines = event.split("\n");
  const parts: string[] = [];
  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    parts.push(line.slice(5).trimStart());
  }
  return parts.length > 0 ? parts.join("\n") : undefined;
}

/** One chunk, or undefined when the provider sent something unparseable. */
function parseChunk(payload: string): DeltaChunk | undefined {
  try {
    return JSON.parse(payload) as DeltaChunk;
  } catch {
    // A provider that emits a stray non-JSON line should cost one chunk, not the
    // whole answer.
    return undefined;
  }
}
