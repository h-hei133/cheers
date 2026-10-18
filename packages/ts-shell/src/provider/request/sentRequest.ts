import { endpointShape, isEventStream } from "../endpoints/index.js";
import type { ProviderUsage } from "../../turn/completion.js";
import type { TurnRequest } from "../endpoints/kinds.js";
import type { RequestContext } from '../../context/request/model.js';
import type { ModelTransport, RequestPolicy } from '../../core/agent/request/model.js';
import { ModelAdmissionError } from '../../core/agent/request/model.js';
import { prepareRequestAttempt } from './attempt.js';

/** A prepared request captured before transport signing, with its exact prompt prefix. */
export interface SentRequest {
  /** Size-only observation of this accepted request, independent of cache refresh replay. */
  readonly context?: RequestContext;
  readonly url: string;
  /** Provider authorization, replaced as a complete set on credential renewal. */
  readonly headers: Readonly<Record<string, string>>;
  /** Endpoint-owned gateway metadata, retained with this request's prefix. */
  readonly requestHeaders?: Readonly<Record<string, string>>;
  readonly body: string;
  readonly endpoint?: string;
  readonly reasoning?: boolean;
  readonly maxTokensField?: TurnRequest["maxTokensField"];
}

/** The endpoint owns replay compatibility and the location of its output ceiling. */
function refreshBody(sent: SentRequest): Record<string, unknown> | undefined {
  try {
    const body: unknown = JSON.parse(sent.body);
    if (!body || typeof body !== "object" || Array.isArray(body)) return undefined;
    return endpointShape(sent.endpoint).refreshBody?.(body as Record<string, unknown>, sent);
  } catch {
    return undefined;
  }
}

/** A budget-dependent cache key must not be changed just to keep a timer armed. */
export function canRefreshSentRequest(sent: SentRequest): boolean {
  return refreshBody(sent) !== undefined;
}

/** Replay a captured prefix once, consuming completion evidence and reported usage. */
export async function sendSentRequest(
  sent: SentRequest,
  signal: AbortSignal | undefined,
  fetchImpl: typeof fetch = fetch,
  metering?: { readonly policy?: RequestPolicy; readonly transport?: ModelTransport; readonly provider: string; readonly model: string;
    readonly onUsage?: (usage: ProviderUsage | undefined) => void;
    readonly credential?: { readonly credentialId: string; readonly generation: string } },
): Promise<ProviderUsage | undefined> {
  const body = refreshBody(sent);
  if (!body || signal?.aborted) return undefined;
  const release = new AbortController();
  try {
    const serialized = JSON.stringify(body);
    const attempt = await prepareRequestAttempt({ body: serialized, provider: metering?.provider ?? '', model: metering?.model ?? String(body.model ?? ''),
      endpoint: sent.endpoint ?? 'openai-compatible', purpose: 'cache-refresh', policy: metering?.policy,
      ...(metering?.credential ? { credential: metering.credential } : {}) });
    const headers = new Headers(sent.headers);
    for (const [name, value] of Object.entries(sent.requestHeaders ?? {})) headers.set(name, value);
    const response = await attempt.send(sent.url, {
      method: "POST",
      headers: Object.fromEntries(headers.entries()),
      body: serialized,
      signal: signal ? AbortSignal.any([signal, release.signal]) : release.signal,
    }, fetchImpl, metering?.transport);
    if (!response.ok) { attempt.settle(); return undefined; }
    const shape = endpointShape(sent.endpoint);
    let usage: ProviderUsage | undefined;
    let finishReason: string | null | undefined;
    let hasMessage = true;
    if (isEventStream(response)) {
      const reader = shape.readStream(response.body!);
      let next = await reader.next();
      while (!next.done) next = await reader.next();
      ({ usage, finishReason } = next.value);
    } else {
      const completion = shape.readBody(await response.json());
      hasMessage = Boolean(completion.choices?.[0]?.message);
      usage = completion.usage;
      finishReason = completion.choices?.[0]?.finish_reason;
    }
    metering?.onUsage?.(usage);
    attempt.settle(usage);
    if (!hasMessage || signal?.aborted || (finishReason != null && !["stop", "length", "tool_calls"].includes(finishReason))) return undefined;
    return usage;
  } catch (error) {
    if (error instanceof ModelAdmissionError) throw error;
    // Background refresh failure never becomes an answer or a usage estimate.
    return undefined;
  } finally {
    // Also releases refused and partially consumed responses.
    release.abort();
  }
}
