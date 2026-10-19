import { vi } from 'vitest';
import * as transport from '../provider/request/fetch.js';

/** Redirect the synthetic issuer wire only after checking the actual request target. */
export function accountWire(baseUrl: string, path = '/codex/responses'): void {
  const create = transport.providerFetchForEndpoint;
  vi.spyOn(transport, 'providerFetchForEndpoint').mockImplementation((config, endpoint, shape, admission, beforeDispatch) =>
    endpoint !== 'openai-account-responses' ? create(config, endpoint, shape, admission, beforeDispatch) : (url, init) => {
      if (String(url) !== 'https://chatgpt.com/backend-api/codex/responses') throw new Error('Synthetic account target mismatch.');
      const refused = admission?.(); if (refused) throw new Error(refused);
      beforeDispatch?.(init);
      return fetch(`${baseUrl}${path}`, { ...init, redirect: 'error' });
    });
}

export function accountCompletion(text: string): string {
  return `data: ${JSON.stringify({ type: 'response.completed', response: { id: 'r', status: 'completed',
    output: [{ type: 'message', id: 'm', role: 'assistant', content: [{ type: 'output_text', text }] }],
    usage: { input_tokens: 4, output_tokens: 1, total_tokens: 5 } } })}\n\n`;
}
