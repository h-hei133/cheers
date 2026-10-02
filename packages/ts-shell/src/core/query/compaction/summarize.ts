import {
  extractFileFootprint,
  formatFileFootprintXml,
  mergeFileFootprints,
  parseFileFootprintXml,
} from "./fileFootprint.js";
import {
  EIGHT_SECTION_COMPACTION_PROMPT,
  UPDATE_COMPACTION_PROMPT,
  formatCheckpointMessage,
  parseCompactedSummary,
} from "./summarizer.js";
import { endpointBody, endpointKind, endpointText, endpointUrl, type EndpointKind } from "../../../provider/endpoints/index.js";

/**
 * One summarization request.
 *
 * Both the in-loop overflow recovery and the explicit `/compact` command need
 * the same thing: the conversation so far condensed into one checkpoint message
 * the model can continue from. Asking the provider is done here, once, so the
 * two paths cannot drift in prompt, parsing, or footprint handling.
 */

export interface CompactionProvider {
  readonly baseUrl: string;
  /**
   * Headers this summarization authenticates with.
   *
   * The same shape the main request uses, for the same reason: a credential that
   * carries an account token rather than an API key has to be able to reach this
   * request too. Built by `providerAuthorization` at the wiring site.
   */
  readonly headers: Readonly<Record<string, string>>;
  readonly model: string;
  /**
   * Whether this model accepts a sampling temperature.
   *
   * Absent means it does, which is what every model got before the catalogue
   * could say otherwise. The compaction request carries no temperature of its
   * own, but the protocols gate on this flag, and a summarizer that cannot say
   * it is a model that rejects one would send a field the host refuses.
   */
  readonly supportsTemperature?: boolean;
  /**
   * Which endpoint kind this request goes to.
   *
   * Absent means the default one. Summarizing is a model call like any other, so
   * it has to speak whatever the run speaks — posting the default shape to an
   * endpoint that wants another fails a compaction that had nothing wrong with
   * it.
   */
  readonly endpoint?: EndpointKind;
}

/**
 * A message the summarizer sends.
 *
 * Text only: a summary request carries the conversation's prose, and a tool call
 * would arrive at the endpoint as a call with no result to pair it with, which
 * the stricter endpoint rejects outright. The tool calls a conversation contains
 * are represented in the text the summarizer is given instead.
 */
export interface CompactionChatMessage {
  readonly role: "system" | "user" | "assistant" | "tool";
  /**
   * Text only, deliberately.
   *
   * The summariser condenses a conversation into words, and it is given the text
   * of it. Carrying images here would mean the summary model receiving pictures
   * it was never asked to describe, so callers pass `messageToText` and this
   * stays a string.
   */
  readonly content?: string | null;
  readonly tool_call_id?: string;
}

export interface CompactionRequest {
  readonly provider: CompactionProvider;
  /**
   * The fetch to send with.
   *
   * Compaction issues its own model call, so it needs the same deadlines and
   * transport as the main request: a summarization that hangs is as fatal to a
   * turn as an answer that hangs, and it is the harder one to notice because the
   * conversation looks idle rather than broken.
   *
   * Required, and deliberately not defaulting to the global `fetch`. It was
   * optional with that fallback, which is how one of the three callers kept the
   * unbounded transport: the omission compiled and ran, and nothing pointed at
   * it. A caller that must pass one cannot leave a model request without a
   * deadline by accident.
   */
  readonly fetchImpl: typeof fetch;
  /** The messages to condense, in order. */
  readonly messages: readonly CompactionChatMessage[];
  readonly signal?: AbortSignal;
  /** What the user asked the summary to pay attention to, if anything. */
  readonly instructions?: string;
  /** Which summary to ask for; defaults to the full checkpoint prompt. */
  readonly prompt?: string;
  /**
   * A sampling temperature for the summarization, when the caller has one.
   *
   * Gated by the provider's `supportsTemperature`, the same gate the main
   * request uses: a model that rejects the field gets a request without it
   * rather than a 400.
   */
  readonly temperature?: number;
  /**
   * The checkpoint the messages already begin with, when a previous compaction
   * wrote one.
   *
   * Present means the messages are additions to that checkpoint rather than a
   * conversation to summarize from scratch, so the summary asked for is a
   * revision of it. Supplying it here rather than letting the caller pick a
   * prompt keeps the choice of prompt and the shape of the request together.
   */
  readonly previousSummary?: string;
}

/** The checkpoint message replacing `messages`, or nothing when the provider could not produce one. */
export async function requestCompactionSummary(request: CompactionRequest): Promise<string | undefined> {
  const previousSummary = request.previousSummary?.trim();
  // Revising a checkpoint and summarizing from scratch are different questions,
  // so the default prompt follows which one is being asked. An explicit prompt
  // still wins: the caller knows if it wants something else entirely.
  const base = request.prompt ?? (previousSummary ? UPDATE_COMPACTION_PROMPT : EIGHT_SECTION_COMPACTION_PROMPT);
  const prompt = request.instructions?.trim()
    ? `${base}\n\nThe user asked the summary to focus on: ${request.instructions.trim()}`
    : base;
  // Always the caller's, so this request carries the same transport and deadlines
  // as the main one. There is no global-fetch fallback: it is what let a caller
  // keep the unbounded transport without anything failing.
  const fetchImpl = request.fetchImpl;
  const headers = new Headers(request.provider.headers);
  headers.set("accept", "application/json");
  const res = await fetchImpl(endpointUrl(request.provider.baseUrl, endpointKind(request.provider.endpoint), request.provider.model, false), {
    method: "POST",
    headers,
    body: JSON.stringify(
      endpointBody(endpointKind(request.provider.endpoint), {
        model: request.provider.model,
        ...(request.provider.supportsTemperature !== undefined
          ? { supportsTemperature: request.provider.supportsTemperature }
          : {}),
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        messages: [
          ...(previousSummary
            ? [{ role: "user" as const, content: `<previous-summary>\n${previousSummary}\n</previous-summary>` }]
            : []),
          ...request.messages,
          { role: "user" as const, content: prompt },
        ],
      }),
    ),
    signal: request.signal,
  });
  if (!res.ok) return undefined;
  const summaryContent = endpointText(endpointKind(request.provider.endpoint), await res.json());
  if (!summaryContent) return undefined;
  const { rawSummary } = parseCompactedSummary(summaryContent);
  // The previous checkpoint's own footprint is merged in, so a file read before
  // an earlier compaction is still named after this one. Without it the list
  // only ever describes the messages in front of the summarizer, and the model
  // re-reads files it has already seen — which is the cost this list exists to
  // avoid.
  const footprint = mergeFileFootprints(
    parseFileFootprintXml(previousSummary),
    extractFileFootprint(request.messages),
  );
  return formatCheckpointMessage(rawSummary, formatFileFootprintXml(footprint));
}
