import { endpointBody, endpointKind, endpointText, endpointUrl, type EndpointKind } from "../endpoints/index.js";
import type { ChatMessage } from "../../turn/prompt.js";

/**
 * One out-of-band model call.
 *
 * The main turn is not the only thing that talks to a provider: a side question
 * and a summarization both do, and both used to build their own request. That is
 * how they came to be the two places in the codebase that reached a provider
 * without going through this layer — so the endpoint shape, the credential, the
 * request shape, and the transport were all decided again at the call site, and
 * the fixes made here did not reach them.
 *
 * The provider is a value rather than something resolved here, because resolving
 * one needs the session's catalog and credentials and this layer is below both.
 * A caller that has resolved a provider passes it; a caller that has not has no
 * business sending a request.
 */
export interface SimpleProvider {
  /** Headers this request authenticates with, already built from the credential. */
  readonly headers: Readonly<Record<string, string>>;
  readonly baseUrl: string;
  readonly model: string;
  /**
   * Which provider this is, when the caller knows.
   *
   * Carried so a caller can say which provider answered without keeping a second
   * copy of the name beside the request.
   */
  readonly providerId?: string;
  /**
   * Which endpoint kind this request goes to.
   *
   * Absent means the OpenAI-compatible shape, which is what every request looked
   * like before a second kind existed. A side question is a model call like any
   * other, so it has to speak whatever the run speaks.
   */
  readonly endpoint?: EndpointKind;
  /** The transport, with its deadlines. Absent means the global fetch. */
  readonly fetchImpl?: typeof fetch;
}

export interface SimpleCompletionRequest {
  readonly provider: SimpleProvider;
  readonly messages: readonly ChatMessage[];
  /** The ceiling this request may produce. Absent leaves the field off. */
  readonly maxOutputTokens?: number;
  /** Whether the model accepts a sampling temperature; see `SimpleRequest`. */
  readonly supportsTemperature?: boolean;
  readonly signal?: AbortSignal;
}

/**
 * The answer text, or nothing when the provider refused or returned none.
 *
 * Nothing rather than a throw, because every caller of this is a side channel:
 * a side question that fails is a side question that has no answer, and a
 * summarization that fails is one the caller retries or reports. Making them
 * handle an exception would only move the same decision to a worse place.
 */
export async function requestSimpleCompletion(
  request: SimpleCompletionRequest,
): Promise<string | undefined> {
  const kind = endpointKind(request.provider.endpoint);
  const fetchImpl = request.provider.fetchImpl ?? fetch;
  // The system instruction travels in its own field, because that is the only
  // place one protocol accepts it: a `system` role inside `messages` is dropped
  // there rather than converted. A caller writing the instruction as the first
  // message would have it silently discarded, and the request would arrive with
  // no instruction at all.
  const systemPrompt = request.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const messages = request.messages.filter((message) => message.role !== "system");
  const res = await fetchImpl(endpointUrl(request.provider.baseUrl, kind), {
    method: "POST",
    headers: request.provider.headers,
    body: JSON.stringify(
      endpointBody(kind, {
        model: request.provider.model,
        systemPrompt,
        messages,
        ...(request.maxOutputTokens !== undefined ? { maxOutputTokens: request.maxOutputTokens } : {}),
        ...(request.supportsTemperature !== undefined
          ? { supportsTemperature: request.supportsTemperature }
          : {}),
      }),
    ),
    ...(request.signal ? { signal: request.signal } : {}),
  });
  if (!res.ok) return undefined;
  const text = endpointText(kind, await res.json());
  return text?.trim() || undefined;
}
