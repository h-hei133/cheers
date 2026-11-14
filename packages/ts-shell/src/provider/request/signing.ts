import { requestUrl } from './client.js';

/**
 * What a request looks like to something that has to sign it.
 *
 * Every field is what the transport already holds at the moment before dispatch,
 * which is the point: a signature covers the method, the URL, the headers and the
 * body, and this is the only place all four exist together. Signing anywhere
 * earlier means signing something that has not been built yet.
 */
export interface SignableRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  /** The serialized body, or nothing for a request that carries none. */
  readonly body?: string;
}

/**
 * Adds whatever a protocol needs to authenticate a request.
 *
 * Returns the headers to send, given the request they will travel with. A
 * credential that is a constant does not need this and does not use it — this is
 * for the ones whose value depends on the request, which is what a signature is.
 * Async because signing is: deriving a key and hashing a body are both.
 */
export type RequestSigner = (
  request: SignableRequest,
) => Promise<Readonly<Record<string, string | undefined>>>;

/**
 * A transport that signs each request before it is sent.
 *
 * The signer runs here because this is where a request exists in full: the
 * method, the final URL, the headers and the serialized body are all in hand one
 * line before dispatch, and a signature covers all four. A credential resolved
 * when the session is built cannot see the body, and the body is most of what is
 * being signed.
 *
 * The signed headers are merged over the caller's, so a signer can add to the
 * request without having to reproduce what the caller already decided.
 */
export function withRequestSigner(base: typeof fetch, signer: RequestSigner): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const url = String(requestUrl(input));
    const headers = headerRecord(init?.headers);
    const body = typeof init?.body === "string" ? init.body : undefined;
    const signed = await signer({
      url,
      method,
      headers,
      ...(body !== undefined ? { body } : {}),
    });
    // An absent entry is not a header: a signer with nothing to add for an
    // optional field says so by leaving it out, and sending the name with no
    // value would be a header the service reads as empty.
    const merged: Record<string, string> = { ...headers };
    for (const [name, value] of Object.entries(signed)) {
      if (value !== undefined) merged[name] = value;
    }
    return await base(input, { ...(init ?? {}), headers: merged });
  }) as typeof fetch;
}

/** The request headers as a plain record, whichever of the three shapes they arrive in. */
function headerRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  if (headers instanceof Headers) {
    const record: Record<string, string> = {};
    headers.forEach((value, name) => {
      record[name] = value;
    });
    return record;
  }
  return { ...(headers as Record<string, string>) };
}
