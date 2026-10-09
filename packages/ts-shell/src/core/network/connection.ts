import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { approvedLookup, publicLookup, publicUrl } from './address.js';
import { responseBody } from './body.js';
import { NetworkError } from './error.js';
import type { RequestScope } from './request.js';

export interface PublicRequest {
  readonly method?: 'GET' | 'POST';
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly maxBytes: number;
}

/** Direct public-web connection; no implicit redirects, proxy DNS, or pooled sockets. */
export async function requestPublic(input: string, init: PublicRequest, scope: RequestScope): Promise<Response> {
  return requestApproved(publicUrl(input), init, scope, publicLookup);
}

/** Same bounded transport, with an explicitly supplied browser URL and DNS-answer policy. */
export async function requestBrowser(input: string, init: PublicRequest, scope: RequestScope, policy: {
  readonly admitUrl: (input: string) => boolean;
  readonly admitAddress: (address: string) => boolean;
}): Promise<Response> {
  if (!policy.admitUrl(input)) throw new NetworkError('denied');
  const url = new URL(input);
  return requestApproved(url, init, scope, (selected, current) => approvedLookup(selected, current, policy.admitAddress));
}

async function requestApproved(url: URL, init: PublicRequest, scope: RequestScope, resolve: typeof publicLookup): Promise<Response> {
  scope.check();
  const lookup = await resolve(url, scope);
  scope.check();
  return new Promise<Response>((resolve, reject) => {
    const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    let response: IncomingMessage | undefined;
    const cleanup = () => scope.signal.removeEventListener('abort', abort);
    const fail = (error: unknown) => { cleanup(); reject(error); };
    // Native signal support may close a socket without settling its header promise.
    // Settle the owner directly and close transport resources independently of error events.
    const abort = () => { fail(scope.signal.reason ?? new NetworkError('cancelled')); response?.destroy(); outgoing.destroy(); };
    const outgoing = request(url, {
      method: init.method ?? 'GET', headers: { 'accept-encoding': 'gzip, deflate, br', ...init.headers },
      // This owner handles cancellation; native abort may synchronously close and
      // remove listeners before rejecting held headers on alternate runtimes.
      lookup, agent: false, maxHeaderSize: 16 * 1024,
      ...(url.protocol === 'https:' ? { rejectUnauthorized: true, servername: isIP(hostname) ? '' : hostname } : {}),
    }, incoming => {
      response = incoming;
      incoming.once('close', cleanup);
      try {
        scope.check();
        const status = incoming.statusCode ?? 0;
        if (status < 200 || status > 599) throw new NetworkError('invalid_response');
        const headers = new Headers();
        for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
          headers.append(incoming.rawHeaders[index]!, incoming.rawHeaders[index + 1]!);
        }
        // Error and redirect payloads are never piped through the consumer or a decoder.
        const noBody = status < 200 || status >= 300 || status === 204 || status === 205;
        if (noBody) incoming.destroy();
        resolve(new Response(noBody ? null : responseBody(incoming, init.maxBytes), { status, headers }));
      } catch (error) { incoming.destroy(); outgoing.destroy(); fail(error); }
    });
    // Keep an error consumer until destruction settles; an asynchronous native abort
    // error must not become an unhandled EventEmitter error after direct rejection.
    outgoing.once('error', fail);
    outgoing.once('close', cleanup);
    outgoing.once('upgrade', (_response, socket) => { socket.destroy(); fail(new NetworkError('invalid_response')); });
    scope.signal.addEventListener('abort', abort, { once: true });
    if (scope.signal.aborted) abort(); else outgoing.end(init.body);
  });
}
