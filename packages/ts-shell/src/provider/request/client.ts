import { STATUS_CODES } from 'node:http';
import { request, type Dispatcher } from 'undici/index.js';
import { decodedBody, discardBody } from './body.js';

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

export function requestUrl(input: RequestInfo | URL): URL {
  return input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url);
}

/**
 * Use the installed dispatcher with native Response streams. The executable's
 * built-in fetch shim ignores dispatchers; the package's fetch stream bridge
 * also stalls there. The package's request API preserves streaming and deadlines.
 */
export async function requestFetch(input: RequestInfo | URL, init: RequestInit | undefined,
  selectDispatcher: (url: URL) => Dispatcher): Promise<Response> {
  const selected = new Request(input, init);
  const signal = selected.signal;
  signal.throwIfAborted();
  // Provider requests already contain serialized payloads. Materialize once so
  // a 307/308 can preserve that payload without replaying a consumed stream.
  let body = selected.body ? Buffer.from(await selected.arrayBuffer()) : undefined;
  let method = selected.method;
  let url = new URL(selected.url);
  const headers = new Headers(selected.headers);
  if (!headers.has('accept-encoding')) headers.set('accept-encoding', 'gzip, deflate, br');
  for (let redirects = 0; ; redirects++) {
    signal.throwIfAborted();
    const response = await request(url, {
      method: method as Dispatcher.HttpMethod, headers: Object.fromEntries(headers), body,
      dispatcher: selectDispatcher(url), signal, idempotent: false,
    }).catch(error => { throw signal.aborted ? signal.reason : new TypeError('fetch failed', { cause: error }); });
    const responseHeaders = receivedHeaders(response.headers);
    const location = responseHeaders.get('location');
    if (REDIRECTS.has(response.statusCode) && location && selected.redirect !== 'manual') {
      discardBody(response.body);
      if (selected.redirect === 'error') throw new TypeError('Redirects are disabled for this request');
      if (redirects >= 20) throw new TypeError('Too many request redirects');
      const next = new URL(location, url);
      if (!['http:', 'https:'].includes(next.protocol) || next.username || next.password) {
        throw new TypeError('Unsupported redirect target');
      }
      if (next.origin !== url.origin) {
        for (const name of ['authorization', 'proxy-authorization', 'cookie', 'cookie2']) headers.delete(name);
      }
      // Host belongs to the actual redirect destination, never to the previous hop.
      headers.delete('host');
      if (([301, 302].includes(response.statusCode) && method === 'POST')
        || (response.statusCode === 303 && method !== 'GET' && method !== 'HEAD')) {
        method = 'GET'; body = undefined;
        for (const name of ['content-encoding', 'content-language', 'content-location', 'content-type', 'content-length']) headers.delete(name);
      }
      url = next;
      continue;
    }
    const noBody = method === 'HEAD' || [204, 205, 304].includes(response.statusCode);
    if (noBody) discardBody(response.body);
    let result: Response;
    try {
      result = new Response(noBody ? null : decodedBody(response.body, responseHeaders, signal), {
        status: response.statusCode, statusText: STATUS_CODES[response.statusCode], headers: responseHeaders,
      });
    } catch (error) { discardBody(response.body); throw error; }
    Object.defineProperties(result, {
      url: { value: url.href }, redirected: { value: redirects > 0 }, type: { value: 'basic' },
    });
    return result;
  }
}

function receivedHeaders(values: Record<string, string | string[] | undefined>): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined) for (const entry of Array.isArray(value) ? value : [value]) headers.append(name, entry);
  }
  return headers;
}
