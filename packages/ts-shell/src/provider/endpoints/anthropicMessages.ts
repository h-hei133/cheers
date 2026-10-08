import {
  formatNonVisionFallback,
  messageToText,
  toAnthropicImageBlock,
  type AnthropicImageBlock,
} from "../../model-adapters/multimodal.js";
import type { ChatMessage } from "../../turn/prompt.js";
import type { ToolSchema } from "../../turn/tools.js";
import type { ProviderUsage, StreamFragment, StreamedCompletion, StreamedToolCall } from "../../turn/completion.js";
import { copilotRequestHeaders } from "./copilotHeaders.js";
import { declareEndpoint } from "./kinds.js";

/**
 * The Anthropic Messages wire shape.
 *
 * One of the endpoint kinds this shell can speak. The others are handled by the
 * OpenAI-compatible path, which is the default; this module exists because the
 * differences are not cosmetic and cannot be expressed as request flags.
 *
 * What differs, and why a flag would not do:
 *
 *   - The system instruction is a top-level field, not a message. A `system`
 *     role in `messages` is rejected outright, so no per-model switch can make
 *     the default shape work.
 *   - Tools carry a JSON Schema under `input_schema`, not a nested `function`
 *     object, and results come back as `tool_use`/`tool_result` content blocks
 *     rather than `tool_calls` and a `tool` role.
 *   - The stream is a sequence of typed events (`message_start`,
 *     `content_block_delta`, `message_delta`, `message_stop`) instead of one
 *     uniform chunk shape with a `delta`.
 *   - Usage arrives split: the input side on `message_start`, the output side on
 *     `message_delta`.
 *
 * Kept as its own module rather than a branch inside the OpenAI reader so that
 * reader stays readable, and so an endpoint that disagrees with both can be
 * added without disturbing either.
 */

/** The protocol version this speaks. Sent as a header, not in the body. */
const API_VERSION = "2023-06-01";

/**
 * The maximum output the API accepts when the caller names none.
 *
 * Anthropic requires `max_tokens`, unlike the OpenAI shape where omitting it
 * lets the host decide. There is no "unset" to send, so a number has to be
 * chosen; this is the smallest ceiling every current model accepts, which makes
 * it the safe default rather than a claim about what the model can do.
 */
const DEFAULT_MAX_TOKENS = 4_096;
/** Room left for the answer when a thinking budget would consume the ceiling. */
const MIN_ANSWER_TOKENS = 1_024;

/** Below this the API rejects a budget, so a smaller ceiling gets no thinking. */
const MIN_THINKING_BUDGET_TOKENS = 1_024;
/** Used when a level was requested without a resolved budget. */
const DEFAULT_THINKING_BUDGET_TOKENS = 8_192;
/**
 * What a withheld reasoning block reads as.
 *
 * The provider does not give us the text, and inventing one would be a lie the
 * model could act on. What it needs to know is that reasoning happened here and
 * is not being shown, which is what this says.
 */
const REDACTED_REASONING = "[reasoning withheld by the provider]";

export interface AnthropicRequestInput {
  readonly model: string;
  readonly systemPrompt: string;
  readonly messages: readonly ChatMessage[];
  readonly tools: readonly ToolSchema[];
  readonly allowTools: boolean;
  /** Simple requests consume one JSON response; main turns stream by default. */
  readonly stream?: boolean;
  /**
   * Whether this model accepts image blocks.
   *
   * Absent means it was not declared, which is treated as no; see
   * `ResolvedRequestShape.vision` for why the safe side is the default.
   */
  readonly vision?: boolean;
  readonly temperature?: number;
  readonly topP?: number;
  readonly maxOutputTokens?: number;
  /** The model's own name for the reasoning level, when it has one. */
  readonly thinkingLevelName?: string;
  /**
   * Whether this model accepts a reasoning block whose signature is empty.
   *
   * A compatible endpoint may emit no signature and still accept the block
   * back. Absent means it was not declared, which is treated as no: sending an
   * unsigned block to a provider that validates signatures is a rejected
   * request, while demoting the text to ordinary content is accepted by both.
   */
  readonly allowEmptySignature?: boolean;
  /**
   * Whether this model accepts a sampling temperature; see
   * `ResolvedRequestShape.supportsTemperature`.
   */
  readonly supportsTemperature?: boolean;
  /**
   * How many tokens the model may spend working out its answer; see
   * `ResolvedRequestShape.thinkingBudgetTokens`.
   */
  readonly thinkingBudgetTokens?: number;
}

/** The headers this endpoint authenticates with, given an API key. */
export function anthropicHeaders(apiKey?: string): Record<string, string> {
  // The key is absent for an endpoint that computes its credential per request:
  // what comes back is then the headers that travel with every request, rather
  // than a header naming an empty key.
  return {
    "content-type": "application/json",
    ...(apiKey ? { "x-api-key": apiKey } : {}),
    "anthropic-version": API_VERSION,
  };
}

/**
 * The request body.
 *
 * System instructions are lifted out of the conversation rather than converted:
 * a `system` message has no equivalent inside `messages`, so leaving one there
 * would fail the request. Tool results are folded into user turns, which is the
 * only place this API accepts them.
 */
export function anthropicRequestBody(input: AnthropicRequestInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: input.model,
    // Required by the API. The caller's ceiling wins when it set one, because a
    // value that fits one model truncates another.
    max_tokens: input.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
    stream: input.stream ?? true,
    messages: convertMessages(input.messages, input.vision, input.allowEmptySignature === true),
  };

  // The instruction and the tool declarations are the stable front of every
  // request, so they are the part worth caching. Marking them is what makes the
  // provider keep them: this endpoint caches only what it is told to, unlike the
  // default one, where a matching prefix is cached without being asked.
  if (input.systemPrompt.trim() !== "") {
    body.system = [{ type: "text", text: input.systemPrompt, cache_control: { type: "ephemeral" } }];
  }
  if (input.allowTools && input.tools.length > 0) {
    const tools = convertTools(input.tools);
    body.tools = markLastForCaching(tools);
  }
  // Omitted where the model is known to reject it, and where thinking is on: a
  // reasoning mode and a sampling temperature are alternatives, not companions.
  if (input.temperature !== undefined && input.supportsTemperature !== false && !input.thinkingLevelName) {
    body.temperature = input.temperature;
  }
  if (input.topP !== undefined) body.top_p = input.topP;
  // Only sent when the model declared a name for the level. An endpoint that
  // does not know the field rejects the whole request, so an unmapped level
  // stays unsent rather than being guessed at.
  if (input.thinkingLevelName !== undefined) {
    // The budget is required alongside `enabled`: the API rejects the field
    // without one, so asking for reasoning without saying how much is not a
    // request it accepts.
    //
    // The budget fits inside the ceiling rather than the other way round. The
    // API requires `max_tokens` to exceed `budget_tokens`, and the ceiling is
    // the number the caller actually chose — a configured output cap is a
    // statement about how much answer is wanted, while the budget comes from the
    // reasoning level and is a preference within it. Raising the ceiling to hold
    // the budget read the level as the stronger of the two and overrode the cap:
    // with the shipped defaults (`maxOutputTokens: 4096`, level `high`) every
    // request asked for 17,408 tokens of output.
    const ceiling = input.maxOutputTokens ?? DEFAULT_MAX_TOKENS;
    const wanted = input.thinkingBudgetTokens ?? DEFAULT_THINKING_BUDGET_TOKENS;
    const budget = Math.min(wanted, ceiling - MIN_ANSWER_TOKENS);
    // A ceiling too small to hold a budget and an answer at all: thinking is
    // omitted rather than sent as a request the API refuses. The answer is what
    // the caller asked for; the reasoning was a preference.
    if (budget >= MIN_THINKING_BUDGET_TOKENS) {
      body.thinking = { type: "enabled", budget_tokens: budget };
    }
  }

  return body;
}

/** One content block, as this API writes them. */
type ContentBlock =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "thinking"; readonly thinking: string; readonly signature: string }
  | { readonly type: "redacted_thinking"; readonly data: string }
  | AnthropicImageBlock
  | { readonly type: "tool_use"; readonly id: string; readonly name: string; readonly input: unknown }
  | { readonly type: "tool_result"; readonly tool_use_id: string; readonly content: string | readonly (AnthropicImageBlock | { readonly type: "text"; readonly text: string })[] };

interface WireMessage {
  readonly role: "user" | "assistant";
  readonly content: readonly ContentBlock[];
}

/**
 * The conversation in this API's shape.
 *
 * Three conversions happen here, and each is required rather than stylistic:
 *
 *   - `system` messages are dropped. The system instruction travels in its own
 *     field, and a `system` role inside `messages` is rejected.
 *   - An assistant turn's tool calls become `tool_use` blocks, because that is
 *     how this API names them.
 *   - A `tool` message becomes a `user` turn carrying a `tool_result` block: the
 *     API has no `tool` role, and its result blocks only appear in user turns.
 */
function convertMessages(
  messages: readonly ChatMessage[],
  vision: boolean | undefined,
  allowEmptySignature: boolean,
): WireMessage[] {
  const wire: WireMessage[] = [];

  for (const message of messages) {
    if (message.role === "system") continue;

    if (message.role === "tool") {
      const block: ContentBlock = {
        type: "tool_result",
        tool_use_id: message.tool_call_id ?? "",
        content: typeof message.content === "string" ? message.content
          : (message.content ?? []).map(block => block.type === "text" ? { type: "text" as const, text: block.text }
            : vision === true ? toAnthropicImageBlock(block) : { type: "text" as const, text: formatNonVisionFallback(block) }),
      };
      // Consecutive results belong in one user turn, which is what the API
      // expects after a turn with several tool calls.
      const previous = wire[wire.length - 1];
      if (previous && previous.role === "user" && isOnlyToolResults(previous)) {
        wire[wire.length - 1] = { role: "user", content: [...previous.content, block] };
      } else {
        wire.push({ role: "user", content: [block] });
      }
      continue;
    }

    const blocks: ContentBlock[] = [];
    // The signed working out goes first, because that is the order it was
    // produced in and the order this API expects it back. Dropping it is what
    // this endpoint rejects: an assistant turn that carries a tool call has to
    // bring the signed block that preceded it, or the request that supplies the
    // tool's result is refused.
    if (message.reasoning?.text) {
      const signature = message.reasoning.signature?.trim();
      if (message.reasoning.redacted && signature) {
        // Issued as an opaque payload, so it goes back the same way. Sending it
        // as a `thinking` block would present withheld text as ours and be
        // rejected; dropping it would leave the tool calls it preceded unsigned.
        blocks.push({ type: "redacted_thinking", data: signature });
      } else if (signature) {
        blocks.push({ type: "thinking", thinking: message.reasoning.text, signature });
      } else if (allowEmptySignature) {
        // A provider that issues no signature also accepts one it did not
        // issue, so the block is kept as reasoning rather than demoted.
        blocks.push({ type: "thinking", thinking: message.reasoning.text, signature: "" });
      } else {
        // No signature to prove it with. Sending an unsigned thinking block is
        // rejected outright, so the text is carried as ordinary content: the
        // reasoning still reaches the model, and the request is still valid.
        blocks.push({ type: "text", text: message.reasoning.text });
      }
    }
    // A message may carry images, and this endpoint takes them as their own
    // blocks in the same array as the text. Flattening to text here would send a
    // request the model reads as a description of a picture it cannot see.
    if (typeof message.content === "string") {
      if (message.content) blocks.push({ type: "text", text: message.content });
    } else if (Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block.type === "text") {
          blocks.push({ type: "text", text: block.text });
          continue;
        }
        // A model that cannot read a picture is given the words for one instead:
        // sending the block anyway fails the request and loses the text beside
        // it, while the description loses only what the model could not use.
        blocks.push(
          // Only a model that says it can read an image gets one. Absent means
          // the catalogue did not say, and the safe reading of that is no — the
          // request fails entirely if the model cannot read it, while the
          // description still carries the words the user wrote.
          vision === true
            ? toAnthropicImageBlock(block)
            : { type: "text", text: formatNonVisionFallback(block) },
        );
      }
    }
    for (const call of message.tool_calls ?? []) {
      blocks.push({
        type: "tool_use",
        id: call.id,
        name: call.function.name,
        input: parseArguments(call.function.arguments),
      });
    }
    // A turn with nothing in it is dropped rather than sent empty: an empty
    // content array is rejected, and the conversation loses nothing by omitting
    // a turn that said nothing.
    if (blocks.length === 0) continue;
    wire.push({ role: message.role === "assistant" ? "assistant" : "user", content: blocks });
  }

  return wire;
}

function isOnlyToolResults(message: WireMessage): boolean {
  return message.content.every((block) => block.type === "tool_result");
}

/**
 * A tool call's arguments, as an object.
 *
 * They arrive as a JSON string because that is how the OpenAI shape carries
 * them. An unparsable string becomes an empty object rather than failing the
 * request: the tool will reject the call on its own terms, and losing the
 * conversation to a malformed argument would be worse than a tool reporting a
 * bad input.
 */
function parseArguments(raw: string): unknown {
  try {
    const parsed: unknown = JSON.parse(raw || "{}");
    return parsed ?? {};
  } catch {
    return {};
  }
}

/**
 * Put a cache marker on the last entry of a list.
 *
 * This endpoint caches everything up to and including a marked block, so marking
 * the end of the stable prefix is how the whole of it is kept. Marking every
 * entry would spend the marker budget on nothing extra, and marking none would
 * cache nothing at all.
 */
function markLastForCaching(
  entries: readonly Record<string, unknown>[],
): readonly Record<string, unknown>[] {
  return entries.map((entry, index) =>
    index === entries.length - 1 ? { ...entry, cache_control: { type: "ephemeral" } } : entry,
  );
}

/** The tool declarations this API expects. */
function convertTools(tools: readonly ToolSchema[]): readonly Record<string, unknown>[] {
  return tools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters ?? { type: "object", properties: {} },
  }));
}

/**
 * Read one non-streamed answer from this endpoint.
 *
 * A host that ignored `stream: true` answers with a single message object whose
 * content is a list of blocks rather than a string. Reading it as the default
 * shape would find no text at all and report an empty answer for a reply that
 * arrived complete.
 */
export function readAnthropicBody(body: unknown): {
  readonly choices: readonly { readonly message: { readonly role: "assistant"; readonly content: string; readonly tool_calls?: readonly StreamedToolCall[] }; readonly finish_reason?: string }[];
  readonly usage?: ProviderUsage;
} {
  const payload = (body ?? {}) as AnthropicBody;
  const blocks = payload.content ?? [];
  const text = blocks
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");
  const toolCalls: StreamedToolCall[] = blocks
    .filter((block) => block.type === "tool_use")
    .map((block) => ({
      id: block.id ?? "",
      type: "function" as const,
      function: { name: block.name ?? "", arguments: JSON.stringify(block.input ?? {}) },
    }));

  return {
    choices: [
      {
        message: {
          role: "assistant",
          content: text,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        ...(payload.stop_reason ? { finish_reason: mapStopReason(payload.stop_reason) } : {}),
      },
    ],
    ...(payload.usage ? { usage: anthropicUsageToProvider(payload.usage) } : {}),
  };
}

/** The whole-body response shape, as far as this reader needs it. */
export interface AnthropicBody {
  readonly content?: readonly {
    readonly type?: string;
    readonly text?: string;
    readonly id?: string;
    readonly name?: string;
    readonly input?: unknown;
  }[];
  readonly stop_reason?: string;
  readonly usage?: AnthropicUsage;
}

/** Usage from a whole-body answer, in the terms the rest of the shell uses. */
function anthropicUsageToProvider(usage: AnthropicUsage): ProviderUsage {
  return {
    prompt_tokens: usage.input_tokens,
    completion_tokens: usage.output_tokens,
    prompt_tokens_details: { cached_tokens: usage.cache_read_input_tokens },
    cache_read_input_tokens: usage.cache_read_input_tokens,
    cache_creation_input_tokens: usage.cache_creation_input_tokens,
  };
}

/**
 * Read this endpoint's event stream.
 *
 * The events are typed rather than uniform, so each one is matched on its own
 * name. Text and tool arguments arrive as deltas that are accumulated by index,
 * because a tool call's arguments are streamed as a partial JSON string across
 * several events.
 */
export async function* readAnthropicStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamFragment, StreamedCompletion, undefined> {
  const decoder = new TextDecoder();
  const iterator = (body as unknown as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]();

  let buffer = "";
  let text = "";
  let reasoning = "";
  let reasoningSignature = "";
  let reasoningRedacted = false;
  let finishReason: string | undefined;
  let usage: ProviderUsage | undefined;
  let sawMessageStop = false;
  let streamFailure: string | undefined;
  const calls = new Map<number, { id: string; name: string; args: string }>();

  /**
   * Fold every complete event in the buffer into the accumulators.
   *
   * Returns the fragments to yield and what is left over, rather than mutating
   * state the caller then has to re-read: an event split across two chunks stays
   * buffered until the rest of it arrives.
   */
  const drain = (): { fragments: StreamFragment[]; rest: string } => {
    const fragments: StreamFragment[] = [];
    let rest = buffer;
    for (;;) {
      // Every separator the event-stream format allows, not just the one this
      // provider is expected to send. A stream framed with CRLF is legal, and a
      // reader that only looks for `\n\n` never finds a boundary in it: the
      // buffer grows until the connection closes and the run sees no output at
      // all. The other reader in this codebase already takes all three, which is
      // how this one was found — the same wire format parsed two ways, and only
      // one of them right.
      const boundary = findEventBoundary(rest);
      if (!boundary) break;
      const raw = rest.slice(0, boundary.at);
      rest = rest.slice(boundary.at + boundary.width);
      const event = parseEvent(raw);
      if (!event) continue;
      // A failure the provider reports in band. The stream itself stays healthy,
      // so this is the only place it can be seen — and it is seen before the
      // fragments are folded, because a failure event carries no content and
      // folding it first would only make the next reader look again.
      if (event.type === "error") {
        streamFailure = event.error?.message || event.error?.type || "provider reported an error mid-stream";
        break;
      }
      fragments.push(
        ...applyEvent(event, {
          calls,
          onText: (chunk) => (text += chunk),
          onReasoning: (chunk) => (reasoning += chunk),
          onSignature: (chunk) => (reasoningSignature += chunk),
          onRedacted: () => (reasoningRedacted = true),
        }),
      );
      if (event.type === "message_stop") {
        sawMessageStop = true;
      }
      if (event.type === "message_delta" && typeof event.delta?.stop_reason === "string") {
        finishReason = event.delta.stop_reason;
      }
      if (event.type === "message_start" && event.message?.usage) {
        usage = mergeUsage(usage, event.message.usage);
      }
      if (event.type === "message_delta" && event.usage) {
        usage = mergeUsage(usage, event.usage);
      }
    }
    return { fragments, rest };
  };

  try {
    for (;;) {
      let chunk: IteratorResult<Uint8Array>;
      try {
        chunk = await iterator.next();
      } catch (error) {
        // A stream that fails mid-answer keeps what it already said, which is the
        // part the user has already read. The buffer is drained first: the last
        // event can arrive in the same chunk that carries the failure, and
        // dropping it would lose text the user was already shown.
        for (const fragment of drain().fragments) yield fragment;
        // Kept, not swallowed. Returning here would present a truncated answer as
        // a finished one: the caller sees a normal message with no finish reason
        // and has nothing to tell the user that anything went wrong.
        throw new Error(`Stream interrupted: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (chunk.done) {
        // A complete final JSON event may arrive without its blank separator.
        buffer += decoder.decode() + "\n\n";
        const drained = drain();
        for (const fragment of drained.fragments) yield fragment;
        if (streamFailure) throw new Error(`Provider reported an error mid-stream: ${streamFailure}`);
        break;
      }
  
      buffer += decoder.decode(chunk.value, { stream: true });
      const drained = drain();
      buffer = drained.rest;
      for (const fragment of drained.fragments) yield fragment;
      if (streamFailure) throw new Error(`Provider reported an error mid-stream: ${streamFailure}`);
    }
  } finally {
    // Release the reader and cancel a connection that stays open after failure.
    await iterator.return?.().catch(() => undefined);
  }

  const toolCalls: StreamedToolCall[] = [...calls.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, call]) => ({
      id: call.id,
      type: "function" as const,
      function: { name: call.name, arguments: call.args || "{}" },
    }));

  // Every stream must report completion, even if it omitted message_start. Either signal
  // counts as having finished: `stop_reason` is the model's own word for it and
  // `message_stop` is the transport's, and a host in front of the API may send
  // one without the other. Requiring both would fail requests that were
  // answered, so a stream that reported either is left alone.
  if (finishReason === undefined && !sawMessageStop) {
    throw new Error("Provider stream ended before it reported the message was complete");
  }

  return {
    message: {
      role: "assistant",
      content: text,
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    },
    reasoning,
    ...(reasoningSignature ? { reasoningSignature } : {}),
    ...(reasoningRedacted ? { reasoningRedacted: true } : {}),
    ...(finishReason ? { finishReason: mapStopReason(finishReason) } : {}),
    ...(usage ? { usage } : {}),
  };
}

/** One server-sent event, as this API types them. */
interface AnthropicEvent {
  readonly type?: string;
  readonly index?: number;
  readonly delta?: {
    readonly type?: string;
    readonly text?: string;
    readonly partial_json?: string;
    readonly stop_reason?: string | null;
    readonly thinking?: string;
    /** A fragment of the provider's signature over the thinking block. */
    readonly signature?: string;
  };
  readonly content_block?: {
    readonly type?: string;
    readonly id?: string;
    readonly name?: string;
    /** The opaque payload of a `redacted_thinking` block, echoed back verbatim. */
    readonly data?: string;
  };
  readonly message?: {
    readonly usage?: AnthropicUsage;
  };
  readonly usage?: AnthropicUsage;
  /**
   * A failure the stream reports in band.
   *
   * This arrives as an ordinary event rather than as a broken connection, so
   * nothing below the event loop notices it: the stream stays healthy, the
   * answer simply never comes. Read it or the failure is indistinguishable from
   * a model that chose to say nothing.
   */
  readonly error?: {
    readonly type?: string;
    readonly message?: string;
  };
}

interface AnthropicUsage {
  readonly input_tokens?: number;
  readonly output_tokens?: number;
  readonly cache_read_input_tokens?: number;
  readonly cache_creation_input_tokens?: number;
}

/** Where the next complete event ends, and how wide its separator is. */
function findEventBoundary(buffer: string): { readonly at: number; readonly width: number } | undefined {
  let at = -1;
  let width = 0;
  for (const separator of ["\r\n\r\n", "\n\n", "\r\r"]) {
    const index = buffer.indexOf(separator);
    if (index < 0 || (at >= 0 && index >= at)) continue;
    at = index;
    width = separator.length;
  }
  return at < 0 ? undefined : { at, width };
}

function parseEvent(raw: string): AnthropicEvent | undefined {
  const data = raw
    .split(/\r\n|\r|\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n");
  if (!data || data === "[DONE]") return undefined;
  try {
    return JSON.parse(data) as AnthropicEvent;
  } catch {
    // A partial or malformed event is skipped rather than failing the stream.
    return undefined;
  }
}

/**
 * Fold one event into the accumulators, yielding whatever it says.
 *
 * Tool arguments are accumulated rather than emitted, because they arrive as
 * fragments of one JSON string and only make sense together.
 */
function applyEvent(
  event: AnthropicEvent,
  state: {
    calls: Map<number, { id: string; name: string; args: string }>;
    onText: (text: string) => void;
    onReasoning: (text: string) => void;
    onSignature: (signature: string) => void;
    /** Marks that the reasoning just accumulated was withheld by the provider. */
    onRedacted: () => void;
  },
): StreamFragment[] {
  const fragments: StreamFragment[] = [];
  const index = event.index ?? 0;

  if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
    state.calls.set(index, {
      id: event.content_block.id ?? "",
      name: event.content_block.name ?? "",
      args: "",
    });
    return fragments;
  }

  // Reasoning the provider has withheld. The text is not ours to read, but the
  // opaque `data` is a signed block like any other: a later turn that omits it
  // while carrying the tool calls it preceded is refused. Carried through as
  // reasoning with the payload as its signature, so the round trip stays intact
  // and the model sees that something was there rather than a silent gap.
  if (event.type === "content_block_start" && event.content_block?.type === "redacted_thinking") {
    const data = event.content_block.data ?? "";
    if (data) {
      state.onReasoning(REDACTED_REASONING);
      state.onSignature(data);
      state.onRedacted();
      fragments.push({ kind: "reasoning", text: REDACTED_REASONING });
    }
    return fragments;
  }

  if (event.type !== "content_block_delta" || !event.delta) return fragments;

  if (event.delta.type === "text_delta" && event.delta.text) {
    state.onText(event.delta.text);
    fragments.push({ kind: "text", text: event.delta.text });
  } else if (event.delta.type === "thinking_delta" && event.delta.thinking) {
    state.onReasoning(event.delta.thinking);
    fragments.push({ kind: "reasoning", text: event.delta.thinking });
  } else if (event.delta.type === "signature_delta" && event.delta.signature !== undefined) {
    // The signature covers the reasoning block that preceded it, and arrives
    // after the text it signs. Accumulated rather than replaced: it is streamed
    // in fragments like everything else here.
    state.onSignature(event.delta.signature);
  } else if (event.delta.type === "input_json_delta" && event.delta.partial_json !== undefined) {
    const call = state.calls.get(index);
    if (call) call.args += event.delta.partial_json;
  }

  return fragments;
}

/** Usage from either half of the stream, merged into one record. */
function mergeUsage(previous: ProviderUsage | undefined, next: AnthropicUsage): ProviderUsage {
  return {
    prompt_tokens: next.input_tokens ?? previous?.prompt_tokens,
    completion_tokens: next.output_tokens ?? previous?.completion_tokens,
    prompt_tokens_details: {
      cached_tokens:
        next.cache_read_input_tokens ?? previous?.prompt_tokens_details?.cached_tokens,
    },
    cache_read_input_tokens:
      next.cache_read_input_tokens ?? previous?.cache_read_input_tokens,
    cache_creation_input_tokens:
      next.cache_creation_input_tokens ?? previous?.cache_creation_input_tokens,
  };
}

/**
 * This API's stop reasons in the terms the rest of the shell uses.
 *
 * `tool_use` becomes `tool_calls` because the turn loop decides whether to keep
 * going from that word; leaving it untranslated would end a turn that had calls
 * to run.
 */
/**
 * Anthropic's stop reason, in the vocabulary the turn layer reads.
 *
 * Total, because the turn layer decides between an answer and a failure from
 * this value and has no way to tell one provider's word for "finished" from
 * another's. `end_turn` is the ordinary one and is why this exists: passing it
 * through unchanged made every normal reply end the run as a failure. The
 * remaining known reasons are mapped to what they mean rather than what they
 * say; a reason this has never seen is left for the turn layer to treat as an
 * unfinished answer, which is the safe reading of an unknown.
 */
function mapStopReason(reason: string): string {
  if (reason === "tool_use") return "tool_calls";
  if (reason === "max_tokens") return "length";
  // The model refused, or its output was cut for a reason that is not length —
  // a safety stop is not a finished answer and must not be reported as one.
  if (reason === "end_turn" || reason === "stop_sequence" || reason === "pause_turn") return "stop";
  return reason;
}

/**
 * The same protocol, declared to the registry.
 *
 * Here rather than in the registry so that this module is the whole of what a
 * protocol is: it reads the wire shape and it says how it is reached. A new
 * protocol copies this file's shape — the reader, then the declaration — and
 * edits nothing else.
 */
declareEndpoint("anthropic-messages", {
  contextFields: { system: 'system', conversation: 'messages', tools: 'tools' },
  // The model travels in the body, so the path is the same for every one.
  path: () => "/messages",
  modelsPath: "/models",
  minimumThinkingOutputTokens: MIN_THINKING_BUDGET_TOKENS + MIN_ANSWER_TOKENS,
  headers: (apiKey) => anthropicHeaders(apiKey),
  // Copilot serves Claude models through this protocol, and its gateway wants
  // the same metadata on these turns as on chat-completions ones.
  requestHeaders: copilotRequestHeaders,
  body: (input) =>
    anthropicRequestBody({
      model: input.model,
      systemPrompt: input.systemPrompt ?? "",
      messages: input.messages,
      tools: [],
      allowTools: false,
      stream: false,
      ...(input.supportsTemperature !== undefined ? { supportsTemperature: input.supportsTemperature } : {}),
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      ...(input.maxOutputTokens !== undefined ? { maxOutputTokens: input.maxOutputTokens } : {}),
    }),
  /**
   * The full turn. The simpler `body` above sends a prompt and no tools; this
   * one sends what a turn has, and the differences are all in what the caller
   * resolved rather than in anything this protocol decides.
   */
  turnBody: (input) =>
    anthropicRequestBody({
      model: input.model,
      systemPrompt: input.systemPrompt,
      messages: input.messages,
      tools: input.tools,
      allowTools: input.allowTools,
      vision: input.vision,
      temperature: input.temperature,
      ...(input.topP !== undefined ? { topP: input.topP } : {}),
      ...(input.maxOutputTokens !== undefined ? { maxOutputTokens: input.maxOutputTokens } : {}),
      ...(input.reasoningEffort && input.thinkingLevelName
        ? { thinkingLevelName: input.thinkingLevelName }
        : {}),
      ...(input.allowEmptySignature ? { allowEmptySignature: true } : {}),
      ...(input.supportsTemperature !== undefined ? { supportsTemperature: input.supportsTemperature } : {}),
      ...(input.thinkingBudgetTokens !== undefined ? { thinkingBudgetTokens: input.thinkingBudgetTokens } : {}),
    }),
  refreshBody: (body) => {
    // A different budget changes the message cache key; retaining it defeats
    // the one-token cost bound. Only non-budgeted requests can be replayed.
    if ((body.thinking as { type?: string } | undefined)?.type === "enabled") return undefined;
    return { ...body, max_tokens: 1 };
  },
  readBody: (body) => readAnthropicBody(body),
  readStream: (body) => readAnthropicStream(body),
});
