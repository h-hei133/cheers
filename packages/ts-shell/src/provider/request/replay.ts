import { createHash } from 'node:crypto';

/** Opaque history is scoped to the captured address and actual credential generation. */
export function requestReplayBinding(input: {
  readonly provider?: string; readonly endpoint?: string; readonly baseUrl: string;
  readonly credentialId?: string; readonly credentialGeneration?: string;
  readonly replayOwner?: string;
  readonly headers?: Readonly<Record<string, string>>; readonly apiKey?: string;
}): string {
  const headers = new Headers(input.headers);
  if (!headers.has('authorization') && input.apiKey) headers.set('authorization', `Bearer ${input.apiKey}`);
  const credentials = ['authorization', 'x-api-key', 'x-goog-api-key', 'chatgpt-account-id'].map(name => [name, headers.get(name)]);
  if (input.endpoint === 'openai-account-responses' && input.replayOwner) {
    return createHash('sha256').update(JSON.stringify([input.provider ?? '', input.endpoint,
      input.baseUrl.trim().replace(/\/+$/, ''), input.credentialId ?? '', input.replayOwner])).digest('hex');
  }
  return createHash('sha256').update(JSON.stringify([input.provider ?? '', input.endpoint ?? 'openai-compatible',
    input.baseUrl.trim().replace(/\/+$/, ''), input.credentialId ?? '', input.credentialGeneration ?? '', credentials])).digest('hex');
}
