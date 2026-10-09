import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';
import { requestBrowser } from '../../network/connection.js';
import { requestScope } from '../../network/request.js';
import { assertAdmission, type Admission } from '../../network/admission.js';
import { parseResponseJson, readResponseText, discardResponse } from '../../network/response.js';
import { mcpAddressPolicy, mcpHttpUrl } from './policy.js';
import type { McpHttpRequests } from './requests.js';
import { withoutResumptionIds } from './stream.js';

export interface McpHttpAuthorization {
  token(admission?: Admission, signal?: AbortSignal): Promise<string | undefined>;
}

/** SDK framing uses the shared bounded connection; no implicit redirects or operation retries. */
export function mcpFetch(serverUrl: string, options: {
  readonly admission?: Admission; readonly headers?: Record<string, string>;
  readonly authorization?: McpHttpAuthorization; readonly authRequired?: boolean;
  readonly streaming?: boolean;
  readonly requests?: McpHttpRequests;
} = {}): FetchLike {
  const server = mcpHttpUrl(serverUrl);
  return async (input, init) => {
    const url = mcpHttpUrl(String(input));
    const method = init?.method ?? 'GET';
    const body = init?.body instanceof URLSearchParams ? init.body.toString() : init?.body;
    if (!['GET', 'POST', 'DELETE'].includes(method) || body !== undefined && body !== null && typeof body !== 'string') throw new Error('Unsupported MCP HTTP request.');
    if (typeof body === 'string' && Buffer.byteLength(body) > 4 * 1024 * 1024) throw new Error('MCP HTTP request exceeds 4 MiB.');
    const request = options.requests?.find(typeof body === 'string' && method === 'POST' ? body : undefined);
    const parent = new AbortController();
    const cancel = () => parent.abort();
    // The SDK supplies the connection signal; cancellation notifications own POSTs.
    const parents = [init?.signal, request?.signal];
    for (const signal of parents) { signal?.addEventListener('abort', cancel, { once: true }); if (signal?.aborted) cancel(); }
    const lifetime = requestScope(15_000, parent.signal);
    const dispose = () => { lifetime.dispose(); request?.release(); for (const signal of parents) signal?.removeEventListener('abort', cancel); };
    const scope = { ...lifetime, check: () => { lifetime.check(); assertAdmission(options.admission); } };
    try {
      scope.check();
      const headers = new Headers(init?.headers);
      if (init?.body instanceof URLSearchParams && !headers.has('content-type')) headers.set('content-type', 'application/x-www-form-urlencoded');
      if (url.href === server.href) {
        const token = await options.authorization?.token(options.admission, scope.signal);
        if (token) headers.set('Authorization', `Bearer ${token}`);
        for (const [name, value] of Object.entries(options.headers ?? {})) headers.set(name, value);
        if (options.authRequired && !headers.has('authorization')) throw new Error('MCP authentication is required.');
      }
      scope.check();
      const response = await requestBrowser(url.href, { method: method as 'GET' | 'POST' | 'DELETE',
        headers: Object.fromEntries(headers), body: body as string | undefined, maxBytes: 8 * 1024 * 1024,
      }, scope, { admitUrl: () => true, admitAddress: mcpAddressPolicy(server, url) });
      scope.check();
      if (!response.ok || !response.body) { discardResponse(response); dispose(); return response; }
      if (options.streaming === false || response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'text/event-stream') {
        const text = await readResponseText(response, scope, 4 * 1024 * 1024);
        if (text || response.status !== 202) parseResponseJson(text);
        dispose();
        return new Response(text || null, { status: response.status, headers: response.headers });
      }
      // GET notifications are connection-owned; request POSTs end on SDK result,
      // deadline or cancellation. Unowned streams retain the bounded deadline.
      if (method === 'GET' || request) lifetime.releaseDeadline();
      const reader = (method === 'POST' ? withoutResumptionIds(response.body) : response.body).getReader();
      request?.bind(() => { void reader.cancel().catch(() => {}); });
      return new Response(new ReadableStream<Uint8Array>({
        async pull(controller) {
          try { scope.check(); const next = await reader.read(); scope.check();
            if (next.done) { dispose(); reader.releaseLock(); controller.close(); }
            else controller.enqueue(next.value);
          } catch (error) { dispose(); void reader.cancel().catch(() => {}); controller.error(error); }
        },
        async cancel() { dispose(); await reader.cancel(); reader.releaseLock(); },
      }), { status: response.status, headers: response.headers });
    } catch (error) {
      dispose();
      // The SDK already rejected this protocol request. Expected local request
      // cancellation must not race a following call by closing the connection.
      if (request?.signal.aborted && !init?.signal?.aborted) return new Response(null, { status: 202 });
      throw error;
    }
  };
}
