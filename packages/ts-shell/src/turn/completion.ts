import * as fs from "node:fs";

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
 *
 * Hosts disagree about the wire, in ways that are only visible once a real one is
 * on the other end. The disagreements handled here are all ones that silently
 * lose data rather than raise anything: a re-sent empty tool name, a call keyed by
 * nothing, arguments as an object instead of a JSON string, CRLF event
 * boundaries, a final event with no blank line after it, and chat-template
 * markers leaking into visible text.
 */

export interface StreamedToolCall {
  readonly id: string;
  readonly type: "function";
  readonly function: { readonly name: string; readonly arguments: string };
}

/**
 * What a provider reports about the request it just answered.
 *
 * Providers disagree on how to report cache traffic. OpenAI-compatible hosts
 * nest it under `prompt_tokens_details.cached_tokens`; Anthropic-shaped ones
 * report `cache_read_input_tokens` and `cache_creation_input_tokens` at the top
 * level. Both are accepted here and flattened by `usageFromProvider`, so the
 * rest of the runtime reads one shape.
 */
export interface ProviderUsage {
  readonly prompt_tokens?: number;
  readonly completion_tokens?: number;
  readonly total_tokens?: number;
  readonly prompt_tokens_details?: { readonly cached_tokens?: number };
  readonly cache_read_input_tokens?: number;
  readonly cache_creation_input_tokens?: number;
}

/**
 * A complete, non-streamed answer, as either endpoint reports one.
 *
 * The shape a reader has to satisfy. It is the same structure the streamed
 * readers assemble into, so a caller that handles both does not need to know
 * which one it got.
 */
export interface CompletedBody {
  readonly choices?: readonly {
    readonly message?: { readonly content?: string | null; readonly tool_calls?: readonly StreamedToolCall[] };
    readonly finish_reason?: string | null;
  }[];
  readonly usage?: ProviderUsage;
  /** The working out, when the provider sent it separately from the answer. */
  readonly reasoning?: string;
}

export interface StreamedCompletion {
  /** Assembled message, shaped like `choices[0].message`. */
  readonly message: {
    readonly role: "assistant";
    readonly content: string;
    readonly tool_calls?: readonly StreamedToolCall[];
  };
  /** Everything the model said while working it out, when it reported any. */
  readonly reasoning: string;
  /**
   * The provider's signature over that working out, when it issued one.
   *
   * Opaque, and not a checksum the caller can verify: some providers sign the
   * reasoning so the next request can prove the reasoning it is being handed
   * back is the reasoning they produced. A signed block that is not returned
   * makes the provider reject the request, so the signature travels with the
   * text it covers rather than being dropped with the display copy.
   */
  readonly reasoningSignature?: string;
  /**
   * Whether that reasoning was withheld and the signature is its opaque payload.
   * See `SessionMessage.reasoning.redacted`.
   */
  readonly reasoningRedacted?: boolean;
  readonly finishReason?: string;
  readonly usage?: ProviderUsage;
}

/** What kind of text a fragment is: the answer, or the working out. */
export type StreamFragment =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "reasoning"; readonly text: string };

/**
 * One entry of a `tool_calls` delta.
 *
 * `id`, `type`, and `name` are all nullable because a host that sends them once
 * still sends the keys on every continuation — as `null`, or as `""`. Typing them
 * honestly is what keeps the accumulator from treating "sent again, empty" as
 * "sent again, changed".
 */
interface ToolCallDelta {
  readonly index?: number | null;
  readonly id?: string | null;
  readonly function?: {
    readonly name?: string | null;
    readonly arguments?: string | Record<string, unknown> | null;
  };
}

interface DeltaChunk {
  readonly choices?: readonly {
    readonly delta?: {
      readonly content?: string | null;
      readonly tool_calls?: readonly ToolCallDelta[];
    };
    readonly finish_reason?: string | null;
  }[];
  readonly usage?: StreamedCompletion["usage"];
}

/** A tool call being assembled across deltas. */
interface PendingCall {
  index: number | undefined;
  id: string;
  name: string;
  args: string;
  /** Set instead of `args` by hosts that stream arguments as an object. */
  object: Record<string, unknown> | undefined;
}

interface StreamState {
  readonly calls: PendingCall[];
  readonly byIndex: Map<number, PendingCall>;
  /** Calls keyed by position in a multi-entry array, for hosts that key nothing. */
  readonly slots: PendingCall[];
  content: string;
  reasoning: string;
  /** Text withheld because it may be the start of a chat-template marker. */
  held: string;
  finishReason: string | undefined;
  usage: StreamedCompletion["usage"];
}

/**
 * Where reasoning arrives, in the order to prefer.
 *
 * Providers disagree: some send `reasoning_content`, some `reasoning`, some
 * `reasoning_text`, and a few send two of them holding the same text. Taking the
 * first non-empty one is what keeps that from being shown twice.
 */
const REASONING_FIELDS = ["reasoning_content", "reasoning", "reasoning_text"] as const;

/**
 * A chat-template special token, which is the model's own scaffolding rather than
 * anything the user asked for. Hosts that do not strip these server-side let them
 * through in visible text. The body is identifier-like and length-capped so prose
 * containing angle brackets survives untouched, and both the fullwidth pipe the
 * tokenizer uses and the ASCII one a re-encoding leaves behind are accepted.
 */
const SPECIAL_TOKEN = /<(?:｜|\|)[A-Za-z0-9_.｜|▁]{1,64}(?:｜|\|)>/g;

/** Longest partial marker worth holding back before deciding it was just prose. */
const MAX_HELD = 256;

/** Keys never merged into tool arguments, whatever the host sends. */
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Whether a response body is a server-sent event stream we can read. */
export function isEventStream(response: { readonly headers: Headers; readonly body: unknown }): boolean {
  const type = response.headers.get("content-type") ?? "";
  return type.includes("text/event-stream") && response.body !== null;
}

/**
 * Consume an SSE completion, yielding each text fragment as it arrives and
 * returning the assembled message.
 */
/** How long to keep reading for a late usage event once the answer is complete. */
const FINISH_GRACE_MS = 2_000;

const GRACE_EXPIRED = Symbol("finish-grace-expired");

/**
 * The next chunk, or a marker when nothing arrives within the grace window.
 *
 * The abandoned `next()` is left to settle on its own; its rejection is caught
 * so a stream that fails after the answer is complete cannot surface as an
 * unhandled error.
 */
async function nextWithGrace(
  iterator: AsyncIterator<Uint8Array>,
  graceMs: number,
): Promise<IteratorResult<Uint8Array> | typeof GRACE_EXPIRED> {
  const pending = iterator.next();
  pending.catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<typeof GRACE_EXPIRED>((resolve) => {
        timer = setTimeout(() => resolve(GRACE_EXPIRED), graceMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whether to narrate the shape of each stream frame.
 *
 * For diagnosing a host whose stream never finishes: the question is always
 * whether the terminal reason arrived, whether the sentinel did, and whether the
 * socket closed — none of which is visible from the screen.
 *
 * Written to a file rather than the terminal. The interactive surface owns the
 * terminal and repaints it; anything else writing there lands between two frames
 * of a repaint, which scrolls the whole view and repeats lines. Content is never
 * written, only the frame's structure.
 */
const TRACE_STREAMS = process.env.CHEERS_STREAM_TRACE === "1";
const TRACE_PATH = process.env.CHEERS_STREAM_TRACE_PATH ?? "stream-trace.log";

function traceStream(message: string): void {
  if (!TRACE_STREAMS) return;
  try {
    fs.appendFileSync(TRACE_PATH, `[stream] ${message}\n`, "utf8");
  } catch {
    // A diagnostic must never be the reason a turn fails.
  }
}

export async function* readCompletionStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamFragment, StreamedCompletion, undefined> {
  const state: StreamState = {
    calls: [],
    byIndex: new Map(),
    slots: [],
    content: "",
    reasoning: "",
    held: "",
    finishReason: undefined,
    usage: undefined,
  };
  const decoder = new TextDecoder();
  const iterator = (body as unknown as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]();
  let buffer = "";
  let ended = false;
  let settled = false;

  try {
    for (;;) {
      // Once the answer is complete, an event carrying usage may still be on its
      // way, so the wait is bounded rather than indefinite — a host holding the
      // connection open must not hold the turn open with it.
      const chunk = settled ? await nextWithGrace(iterator, FINISH_GRACE_MS) : await iterator.next();
      if (chunk === GRACE_EXPIRED) {
        traceStream("stopped: grace window expired");
        break;
      }
      if (chunk.done) {
        traceStream("stopped: socket closed by host");
        break;
      }
      buffer += decoder.decode(chunk.value, { stream: true });
      for (;;) {
        const split = nextEvent(buffer);
        if (!split) break;
        buffer = split.rest;
        const step = absorb(split.event, state);
        yield* step.fragments;
        if (step.ended) {
          traceStream("stopped: [DONE] sentinel");
          ended = true;
          break;
        }
        if (step.settled) settled = true;
      }
      if (ended) break;
    }
  } finally {
    // Released on every exit, including the grace expiry: `for await` does this
    // itself, and doing the read by hand means doing it here. A body left open
    // holds its connection, and a held connection outlives the turn.
    void Promise.resolve(iterator.return?.(undefined)).catch(() => undefined);
  }

  // A host that closes without a blank line after its last event leaves it in the
  // buffer. Dropping it costs whatever that event carried, which on a short answer
  // is the answer.
  if (!ended && buffer.trim().length > 0) {
    yield* absorb(buffer, state).fragments;
  }
  const tail = flushHeld(state);
  if (tail) yield { kind: "text", text: tail };

  if (TRACE_STREAMS) {
    traceStream(
      `turn ended finish_reason=${state.finishReason ?? "-"} content_chars=${state.content.length} calls=${state.calls.length} usage=${state.usage ? "yes" : "no"}`,
    );
  }
  return assemble(state);
}

/** The next complete event and what follows it, for any of the SSE separators. */
function nextEvent(buffer: string): { readonly event: string; readonly rest: string } | undefined {
  let at = -1;
  let width = 0;
  for (const separator of ["\r\n\r\n", "\n\n", "\r\r"]) {
    const index = buffer.indexOf(separator);
    if (index < 0 || (at >= 0 && index >= at)) continue;
    at = index;
    width = separator.length;
  }
  return at < 0 ? undefined : { event: buffer.slice(0, at), rest: buffer.slice(at + width) };
}

/** Fold one event into the state, reporting the text it produced. */
function absorb(
  event: string,
  state: StreamState,
): { readonly fragments: readonly StreamFragment[]; readonly ended: boolean; readonly settled: boolean } {
  const payload = eventData(event);
  if (payload === undefined) return { fragments: [], ended: false, settled: false };
  if (payload === "[DONE]") return { fragments: [], ended: true, settled: false };
  const parsed = parseChunk(payload);
  if (!parsed) return { fragments: [], ended: false, settled: false };
  if (parsed.usage) state.usage = parsed.usage;
  const choice = parsed.choices?.[0];
  if (choice?.finish_reason) state.finishReason = choice.finish_reason;
  if (TRACE_STREAMS) {
    const keys = choice?.delta ? Object.keys(choice.delta).filter((k) => k !== "content") : [];
    traceStream(
      `frame finish_reason=${choice?.finish_reason ?? "-"} delta_keys=${keys.join("|") || "-"} usage=${parsed.usage ? "yes" : "no"}`,
    );
  }
  const delta = choice?.delta;
  // A terminal finish reason ends the answer even though more events may follow.
  // The `[DONE]` sentinel is the documented end of the stream but not a reliable
  // one: a host behind a keep-alive proxy can hold the connection open after its
  // last event, and waiting for a close that never comes leaves the turn running
  // with nothing left to read. Continuing would only collect the usage event,
  // which is already reported before the reason on the hosts that send it late.
  const finished = isTerminalFinishReason(choice?.finish_reason);
  if (!delta) return { fragments: [], ended: false, settled: finished };

  const batch = delta.tool_calls ?? [];
  for (let offset = 0; offset < batch.length; offset++) {
    applyCall(pickCall(state, batch[offset]!, offset, batch.length), batch[offset]!);
  }

  const fragments: StreamFragment[] = [];
  if (typeof delta.content === "string" && delta.content.length > 0) {
    const text = visibleText(state, delta.content);
    if (text) {
      state.content += text;
      fragments.push({ kind: "text", text });
    }
  }
  // A reasoning model can put its entire visible output here and leave
  // `content` empty. Dropping it meant the turn produced nothing at all.
  const thinking = reasoningDelta(delta as unknown as Record<string, unknown>);
  if (thinking) {
    state.reasoning += thinking;
    fragments.push({ kind: "reasoning", text: thinking });
  }
  // The content is complete, but a host that reports usage in its own event
  // sends that event after this one, so the caller may still read a little more.
  return { fragments, ended: false, settled: finished };
}

/**
 * Whether a finish reason means the answer is complete.
 *
 * The reasons a provider sends when it has stopped generating. Anything else —
 * absent, or a value this does not know — leaves the stream open in case more
 * content follows it.
 */
function isTerminalFinishReason(reason: string | null | undefined): boolean {
  return (
    reason === "stop" ||
    reason === "tool_calls" ||
    reason === "length" ||
    reason === "content_filter"
  );
}

/**
 * The call this delta belongs to.
 *
 * `index` is the contract and is honoured first. A host that omits it but sends an
 * `id` is matched on that. A host that sends neither is positional: a multi-entry
 * array is one entry per call, and a lone entry continues whichever call is open.
 */
function pickCall(state: StreamState, delta: ToolCallDelta, offset: number, batch: number): PendingCall {
  const index = typeof delta.index === "number" ? delta.index : undefined;
  if (index !== undefined) {
    const keyed = state.byIndex.get(index);
    if (keyed) return keyed;
  }
  const id = typeof delta.id === "string" && delta.id.length > 0 ? delta.id : undefined;
  if (id) {
    const named = state.calls.find((call) => call.id === id);
    if (named) return named;
  }
  if (index === undefined && !id) {
    const positional = batch > 1 ? state.slots[offset] : state.calls[state.calls.length - 1];
    if (positional) return positional;
  }
  const created: PendingCall = { index, id: id ?? "", name: "", args: "", object: undefined };
  state.calls.push(created);
  if (index !== undefined) state.byIndex.set(index, created);
  if (batch > 1) state.slots[offset] = created;
  return created;
}

/**
 * Fold one delta into a call.
 *
 * Only non-empty values overwrite. A host that sends the name once and then
 * `name: ""` on every argument chunk is not renaming the call to nothing — but
 * `??` reads an empty string as a value, which erased the name and made the
 * assembled call unexecutable.
 */
function applyCall(call: PendingCall, delta: ToolCallDelta): void {
  if (typeof delta.id === "string" && delta.id.length > 0) call.id = delta.id;
  const name = delta.function?.name;
  if (typeof name === "string" && name.length > 0) call.name = name;
  const args = delta.function?.arguments;
  if (typeof args === "string") {
    call.args += args;
    return;
  }
  if (args && typeof args === "object" && !Array.isArray(args)) {
    call.object = mergeArgs(call.object ?? {}, args);
  }
}

/**
 * Merge an object-shaped argument delta.
 *
 * Hosts that break the JSON-string contract usually send the whole object in one
 * chunk, so a shallow merge is right; when one fragments a string value across
 * chunks the longer of the two is kept, since a continuation always extends what
 * came before.
 */
function mergeArgs(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (UNSAFE_KEYS.has(key)) continue;
    const existing = merged[key];
    if (typeof existing === "string" && typeof value === "string") {
      merged[key] = value.length >= existing.length ? value : existing;
      continue;
    }
    merged[key] = value;
  }
  return merged;
}

/**
 * The part of `text` that can be shown now, with chat-template markers removed.
 *
 * A marker split across two deltas would otherwise be unmatchable, so a trailing
 * partial is held back until the next delta completes or refutes it.
 */
function visibleText(state: StreamState, text: string): string {
  const pending = state.held + text;
  const partial = heldPartial(pending);
  state.held = partial;
  const ready = partial.length > 0 ? pending.slice(0, pending.length - partial.length) : pending;
  return ready.replace(SPECIAL_TOKEN, "");
}

/** Whatever was being held back, once no more deltas are coming. */
function flushHeld(state: StreamState): string {
  const held = state.held.replace(SPECIAL_TOKEN, "");
  state.held = "";
  state.content += held;
  return held;
}

/** A trailing unclosed marker, or the lone `<` that may be about to start one. */
function heldPartial(text: string): string {
  const at = Math.max(text.lastIndexOf("<｜"), text.lastIndexOf("<|"));
  if (at < 0) return text.endsWith("<") ? "<" : "";
  const tail = text.slice(at);
  if (tail.includes("｜>") || tail.includes("|>")) return "";
  return tail.length > MAX_HELD ? "" : tail;
}

/** Reasoning in this delta, whichever field the provider chose to put it in. */
function reasoningDelta(delta: Record<string, unknown>): string | undefined {
  for (const field of REASONING_FIELDS) {
    const value = delta[field];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

/** The finished completion, shaped exactly like a non-streamed one. */
function assemble(state: StreamState): StreamedCompletion {
  const ordered = state.calls.every((call) => call.index !== undefined)
    ? [...state.calls].sort((left, right) => left.index! - right.index!)
    : state.calls;
  const toolCalls = ordered
    // A call with no name cannot be dispatched. With empty names no longer
    // erasing real ones, reaching here means the host truly never sent one.
    .filter((call) => call.name.length > 0)
    .map((call, position) => ({
      id: call.id.length > 0 ? call.id : `call_stream_${position}`,
      type: "function" as const,
      function: {
        name: call.name,
        arguments: call.object ? JSON.stringify(call.object) : call.args,
      },
    }));

  return {
    message: {
      role: "assistant",
      content: state.content,
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    },
    reasoning: state.reasoning,
    finishReason: state.finishReason,
    usage: state.usage,
  };
}

/** The `data:` payload of one event, or undefined for comments and keep-alives. */
function eventData(event: string): string | undefined {
  const parts: string[] = [];
  for (const line of event.split(/\r\n|\r|\n/)) {
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
