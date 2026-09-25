import type { ChatMessage } from "../../turn/prompt.js";
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
  /** The resource appended to a base URL. */
  readonly path: string;
  /** The credential headers this endpoint authenticates with. */
  readonly headers: (apiKey: string) => Record<string, string>;
  /** A request body for the callers that send no tools. */
  readonly body: (input: SimpleRequest) => Record<string, unknown>;
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

/** The URL a request goes to. */
export function endpointUrl(baseUrl: string, kind: EndpointKind | undefined): string {
  return `${baseUrl.replace(/\/+$/, "")}${endpointShape(kind).path}`;
}

/** The body a request with no tools sends. */
export function endpointBody(kind: EndpointKind | undefined, input: SimpleRequest): Record<string, unknown> {
  return endpointShape(kind).body(input);
}

/** The text of a non-streamed answer, whichever kind sent it. */
export function endpointText(kind: EndpointKind | undefined, body: unknown): string | undefined {
  return endpointShape(kind).readBody(body).choices?.[0]?.message?.content ?? undefined;
}

/** Whether a response is a stream, which no kind disagrees about. */
export { isEventStream };
