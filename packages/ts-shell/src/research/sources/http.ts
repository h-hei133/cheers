import { createHash } from 'node:crypto';
import { requestWithRedirects } from '../../core/network/redirect.js';
import { discardResponse, readResponseBytes, parseResponseJson } from '../../core/network/response.js';
import { httpError, NetworkError } from '../../core/network/error.js';
import type { RequestScope } from '../../core/network/request.js';
import type { PublicRequest } from '../../core/network/connection.js';
import { limitedSource, waitSource } from './limit.js';

export type SourceTransport = typeof requestWithRedirects;
export interface SourceBody { readonly bytes: Uint8Array; readonly hash: string; readonly finalUrl: string; readonly mime: string; readonly fetchedAt: string }

export async function sourceBody(url: string, scope: RequestScope, options: {
  readonly headers?: PublicRequest['headers']; readonly maxBytes?: number; readonly provider?: string; readonly spacingMs?: number;
  readonly transport?: SourceTransport;
} = {}): Promise<SourceBody> {
  const consume = async (): Promise<SourceBody> => {
    const { response, finalUrl } = await (options.transport ?? requestWithRedirects)(url,
      { method: 'GET', headers: options.headers, maxBytes: options.maxBytes ?? 2 * 1024 * 1024 }, scope, options.provider || options.headers ? 'same-origin' : 'public');
    if (!response.ok) {
      const retryAfter = response.headers.get('retry-after'); discardResponse(response);
      const failure = httpError(response.status);
      if (response.status === 429 && retryAfter) Object.assign(failure, { retryAfterMs: retryDelay(retryAfter) });
      throw failure;
    }
    const bytes = await readResponseBytes(response, scope, options.maxBytes ?? 2 * 1024 * 1024);
    scope.check();
    return { bytes, hash: createHash('sha256').update(bytes).digest('hex'), finalUrl,
      mime: response.headers.get('content-type') ?? '', fetchedAt: new Date().toISOString() };
  };
  for (let attempt = 0; ; attempt++) {
    try { return options.provider ? await limitedSource(options.provider, options.spacingMs ?? 1000, scope, consume) : await consume(); }
    catch (error) {
      if (!(error instanceof NetworkError) || error.code !== 'rate_limited' || attempt >= 1) throw error;
      const delay = (error as NetworkError & { retryAfterMs?: number }).retryAfterMs ?? 1000;
      if (delay > 10_000) throw error;
      await waitSource(delay, scope);
    }
  }
}

export function sourceJson(body: SourceBody): unknown {
  return parseResponseJson(new TextDecoder().decode(body.bytes), 24);
}

function retryDelay(value: string): number {
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 1000;
}
