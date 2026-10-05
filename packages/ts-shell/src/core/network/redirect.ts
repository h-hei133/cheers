import { requestPublic, type PublicRequest } from './connection.js';
import { publicUrl } from './address.js';
import { NetworkError } from './error.js';
import { discardResponse } from './response.js';
import type { RequestScope } from './request.js';

/** Search credentials remain at their configured origin; public pages have no credentials. */
export async function requestWithRedirects(input: string, init: PublicRequest, scope: RequestScope,
  policy: 'public' | 'same-origin'): Promise<{ response: Response; finalUrl: string }> {
  const origin = publicUrl(input).origin;
  let current = input;
  let request = init;
  for (let hop = 0; hop <= 5; hop++) {
    scope.check();
    const response = await requestPublic(current, request, scope);
    try { scope.check(); } catch (error) { discardResponse(response); throw error; }
    if (![301, 302, 303, 307, 308].includes(response.status)) return { response, finalUrl: current };
    discardResponse(response);
    if (hop === 5) throw new NetworkError('redirect_limit');
    const location = response.headers.get('location');
    if (!location) throw new NetworkError('invalid_response');
    let next: URL;
    try { next = new URL(location, current); } catch { throw new NetworkError('invalid_response'); }
    publicUrl(next.href);
    if (policy === 'same-origin' && next.origin !== origin) throw new NetworkError('denied');
    if (response.status === 303 || ((response.status === 301 || response.status === 302) && request.method === 'POST')) {
      const headers = Object.fromEntries(Object.entries(request.headers ?? {}).filter(([name]) =>
        !['content-type', 'content-length', 'transfer-encoding'].includes(name.toLowerCase())));
      request = { ...request, method: 'GET', body: undefined, headers };
    }
    current = next.href;
  }
  throw new NetworkError('redirect_limit');
}
