import type { ChatMessage } from "../../turn/prompt.js";
import type { ToolSchema } from "../../turn/tools.js";
import {
  isEventStream,
  type CompletedBody,
  type StreamFragment,
  type StreamedCompletion,
} from "../../turn/completion.js";

/**
 * The protocol kinds this build speaks, and how one is looked up.
 *
 * Two protocols are spoken, and they disagree about four things: the resource
 * path, how a credential becomes a header, what the body looks like, and how a
 * response is read — streamed or not. Those disagreements used to be `if`
 * statements in five files, each written where the answer was needed, so the
 * number of places to change when adding a third was the number of files rather
 * than the number of protocols.
 *
 * This file holds the registry and no protocol. Each protocol is a module that
 * declares itself to it, so a new one is a new module rather than an edit here
 * and in every caller.
 *
 * Not an abstraction over the request. The turn's own request carries tools,
 * streaming and a listener, and rebuilding it here would mean a worse version of
 * code that already exists — the reference draws the same line, keeping the full
 * request at the call site and the wire facts in the protocol. What is here is
 * what is genuinely a property of the protocol.
 */

/**
 * The endpoint kind a request is sent in.
 *
 * A string rather than a closed union. A protocol is a module that declares
 * itself, so the set of them is whatever has been registered — closing the type
 * would make every addition an edit to this file, which is the coupling being
 * removed.
 */
export type EndpointKind = string;

/** What one endpoint needs to say about itself. */
export interface EndpointShape {
  /**
   * The resource appended to a base URL, given the model this request is for.
   *
   * A function rather than a string because not every protocol puts the model in
   * the body. Some name it in the path — `/model/{id}/converse-stream` — and a
   * protocol that does cannot be expressed as one constant. The protocols that
   * name it in the body ignore the argument and return their constant.
   */
  readonly path: (model: string) => string;
  /** The credential headers this endpoint authenticates with. */
  readonly headers: (apiKey: string) => Record<string, string>;
  /** A request body for the callers that send no tools. */
  readonly body: (input: SimpleRequest) => Record<string, unknown>;
  /**
   * The body for a full turn, tools included.
   *
   * Separate from `body` because the two callers ask different questions: a
   * summarizer sends a conversation and a prompt, a turn sends tools, a sampling
   * temperature, and the model's own vocabulary for its reasoning level. Folding
   * them together would make the simpler caller pass a dozen fields it does not
   * have.
   */
  readonly turnBody: (input: TurnRequest) => Record<string, unknown>;
  /** A complete, non-streamed answer, flattened to the shape both kinds share. */
  readonly readBody: (body: unknown) => CompletedBody;
  /** The chunks of a streamed answer, and the completion they add up to. */
  readonly readStream: (
    body: ReadableStream<Uint8Array>,
  ) => AsyncGenerator<StreamFragment, StreamedCompletion, undefined>;
}

/** A request with no tools, which is what a summarizer or a side question sends. */
export interface SimpleRequest {
  readonly model: string;
  readonly messages: readonly ChatMessage[];
  /** A system instruction, when the caller has one. */
  readonly systemPrompt?: string;
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
  /**
   * Whether this model accepts a sampling temperature at all.
   *
   * Absent means it does, which is what every model got before the catalogue
   * could say otherwise. Declared here as well as on the full request because a
   * caller that sets a temperature has to be able to say the model rejects one:
   * without it the only way to send a temperature was to send it ungated, which
   * is the 400 this field exists to avoid.
   */
  readonly supportsTemperature?: boolean;
}

/**
 * Everything one turn's request needs, in the terms the caller owns.
 *
 * This is what separates a protocol from a default: the caller says what the
 * conversation is and what the model accepts, and the protocol decides how that
 * becomes a body. The main turn used to decide that here with a branch on the
 * kind, which meant a third protocol would have had to edit the turn loop — the
 * one thing consolidating the protocols was for.
 *
 * The per-model facts arrive already resolved, because which of them apply is a
 * question about the model rather than about the protocol; a protocol only
 * decides how to write them down.
 */
export interface TurnRequest {
  readonly model: string;
  readonly systemPrompt: string;
  readonly messages: readonly ChatMessage[];
  readonly tools: readonly ToolSchema[];
  readonly allowTools: boolean;
  /** Whether this model accepts images; see `ResolvedRequestShape.vision`. */
  readonly vision: boolean;
  readonly temperature: number;
  readonly topP?: number;
  readonly maxOutputTokens?: number;
  /** The model's own name for the reasoning level, when it has one. */
  readonly thinkingLevelName?: string;
  /**
   * Whether this model accepts a reasoning block whose signature is empty; see
   * `AnthropicRequestInput.allowEmptySignature`. Only the Anthropic-shaped
   * protocol has such a block, so the others ignore it.
   */
  readonly allowEmptySignature?: boolean;
  /**
   * Whether this model accepts a sampling temperature; see
   * `ResolvedRequestShape.supportsTemperature`. Absent means yes, which is what
   * every model got before the field existed.
   */
  readonly supportsTemperature?: boolean;
  /**
   * How many tokens the model may spend working out its answer; see
   * `ResolvedRequestShape.thinkingBudgetTokens`. Only the Anthropic-shaped
   * protocol takes a budget, so the others ignore it.
   */
  readonly thinkingBudgetTokens?: number;
  /** The role carrying the system instruction. */
  readonly systemRole: "system" | "developer";
  /** Whether the level may be sent at all. */
  readonly reasoningEffort: boolean;
  /** The field carrying the output ceiling. */
  readonly maxTokensField: "max_tokens" | "max_completion_tokens";
  /** Whether a synthetic assistant turn bridges tool results and a user turn. */
  readonly assistantAfterToolResult: boolean;
}

/**
 * The kind a request is sent in when nobody declared one.
 *
 * The default wire form: what a model with no declared endpoint has always been
 * sent, and what most providers speak.
 */
export const DEFAULT_ENDPOINT_KIND = "openai-compatible";

/**
 * Everything declared so far, by kind.
 *
 * A registry rather than a table with a fallback. Falling back on an unknown kind
 * would send a request in a shape the protocol does not speak, and it would fail
 * at the provider with a message about the payload rather than here with a
 * message about the protocol nobody recognized.
 */
const DECLARED = new Map<EndpointKind, EndpointShape>();

/**
 * Declare a protocol.
 *
 * Called by the modules that implement one, at import. Exported so a test can
 * declare a stub and check that the callers really do route through here: a claim
 * that adding a protocol changes nothing else is only worth making if it can be
 * shown.
 */
export function declareEndpoint(kind: EndpointKind, shape: EndpointShape): void {
  DECLARED.set(kind, shape);
}

/** Everything declared, for a caller that needs to name the kinds. */
export function declaredEndpointKinds(): readonly EndpointKind[] {
  return [...DECLARED.keys()];
}

/**
 * The shape for a kind, or the default one when none was named.
 *
 * A declared kind that nothing registered is an error rather than a silent
 * fallback. A request sent in the wrong shape fails at the provider, which is the
 * harder failure to read.
 */
export function endpointShape(kind: EndpointKind | undefined): EndpointShape {
  const requested = kind ?? DEFAULT_ENDPOINT_KIND;
  const shape = DECLARED.get(requested);
  if (!shape) {
    throw new Error(
      `No endpoint declared for '${requested}'. Declared: ${declaredEndpointKinds().join(", ")}.`,
    );
  }
  return shape;
}

/**
 * The kind a configured endpoint names, or nothing when none was named.
 *
 * No translation table. A configured value that matches a declared kind is that
 * kind, and one that matches nothing is left for the registry to reject by name —
 * mapping unknown values onto the default here would hide the typo until the
 * provider rejected the payload.
 */
export function endpointKind(configured: string | undefined): EndpointKind | undefined {
  return configured === undefined || configured === "" ? undefined : configured;
}

/**
 * The URL a request goes to.
 *
 * The model travels in because a protocol may name it in the path. Passing it
 * here rather than letting each caller assemble the URL keeps one place that
 * knows how a base URL and a resource join.
 */
export function endpointUrl(baseUrl: string, kind: EndpointKind | undefined, model: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${endpointShape(kind).path(model)}`;
}

/** The body a request with no tools sends. */
export function endpointBody(kind: EndpointKind | undefined, input: SimpleRequest): Record<string, unknown> {
  return endpointShape(kind).body(input);
}

/** The body a full turn sends, in the protocol's own shape. */
export function endpointTurnBody(
  kind: EndpointKind | undefined,
  input: TurnRequest,
): Record<string, unknown> {
  return endpointShape(kind).turnBody(input);
}

/** The text of a non-streamed answer, whichever kind sent it. */
export function endpointText(kind: EndpointKind | undefined, body: unknown): string | undefined {
  return endpointShape(kind).readBody(body).choices?.[0]?.message?.content ?? undefined;
}

/** Whether a response is a stream, which no kind disagrees about. */
export { isEventStream };
