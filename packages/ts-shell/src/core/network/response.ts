import { NetworkError } from './error.js';
import type { RequestScope } from './request.js';

/** Discard without consuming or allowing slow cleanup to hold up cancellation. */
export function discardResponse(response: Response): void {
  void response.body?.cancel().catch(() => undefined);
}

/** Limits response-stream bytes, after any transport decompression. */
export async function readResponseText(response: Response, scope: RequestScope, maxBytes: number): Promise<string> {
  const declared = response.headers.get('content-length');
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    discardResponse(response);
    throw new NetworkError('response_limit');
  }
  try { scope.check(); } catch (error) { discardResponse(response); throw error; }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const cancel = (): void => { void reader.cancel().catch(() => undefined); };
  scope.signal.addEventListener('abort', cancel, { once: true });
  let buffer = new Uint8Array(Math.min(maxBytes, 64 * 1024));
  let bytes = 0;
  let complete = false;
  try {
    for (;;) {
      scope.check();
      const { done, value } = await reader.read();
      scope.check();
      if (done) { complete = true; break; }
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new NetworkError('response_limit');
      if (bytes > buffer.byteLength) {
        const grown = new Uint8Array(Math.min(maxBytes, Math.max(bytes, buffer.byteLength * 2)));
        grown.set(buffer);
        buffer = grown;
      }
      buffer.set(value, bytes - value.byteLength);
    }
    return new TextDecoder().decode(buffer.subarray(0, bytes));
  } finally {
    if (!complete) cancel();
    scope.signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

/** Depth is bounded before native JSON parsing, including otherwise-unused fields. */
export function parseResponseJson(text: string, maxDepth = 32): unknown {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (const character of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === '{' || character === '[') {
      if (++depth > maxDepth) throw new NetworkError('invalid_response');
    } else if (character === '}' || character === ']') depth--;
  }
  try { return JSON.parse(text) as unknown; }
  catch { throw new NetworkError('invalid_response'); }
}
