import { afterEach, expect, it, vi } from 'vitest';
import type { PreparedRequest, RequestPolicy } from '../../core/agent/request/model.js';
import { prepareRequestAttempt } from './attempt.js';
import { clearCredentialBackoff, credentialBackoffRemaining, noteCredentialRateLimit, resetCredentialBackoffForTests,
  responseBackoffMs } from './backoff.js';

afterEach(() => { resetCredentialBackoffForTests(); vi.restoreAllMocks(); });

const key = { credentialId: 'openai:work', generation: 'aaaaaaaaaaaaaaaa' };
const other = { credentialId: 'openai:personal', generation: 'bbbbbbbbbbbbbbbb' };

function policy() {
  const reserved: PreparedRequest[] = [];
  const value = { reserve: (request: PreparedRequest) => { reserved.push(request);
    return { id: 'attempt', dispatch: () => {}, confirmUnsent: () => {}, settle: () => {} }; } } as RequestPolicy;
  return { reserved, policy: value };
}

it('scopes a rate limit to one credential generation', () => {
  noteCredentialRateLimit(key, 30_000, 1_000);
  expect(credentialBackoffRemaining(key, 1_000)).toBe(30_000);
  expect(credentialBackoffRemaining(other, 1_000)).toBe(0);
  expect(credentialBackoffRemaining({ ...key, generation: 'cccccccccccccccc' }, 1_000)).toBe(0);
  expect(credentialBackoffRemaining(key, 40_000)).toBe(0);
});

it('prefers the server delay and falls back to one minute', () => {
  expect(responseBackoffMs(new Headers({ 'retry-after': '2' }), 0)).toBe(2_000);
  expect(responseBackoffMs(new Headers({ 'retry-after-ms': '1500' }), 0)).toBe(1_500);
  expect(responseBackoffMs(new Headers(), 0)).toBe(60_000);
});

it('refuses a send while the captured credential is waiting, without touching another credential', async () => {
  noteCredentialRateLimit(key, 30_000);
  const reserved = policy();
  await expect(prepareRequestAttempt({ body: '{}', provider: 'openai', model: 'm', endpoint: 'openai-compatible',
    purpose: 'turn', policy: reserved.policy, credential: key })).rejects.toThrow(/rate limited/i);
  expect(reserved.reserved).toHaveLength(0);
  const allowed = await prepareRequestAttempt({ body: '{}', provider: 'openai', model: 'm', endpoint: 'openai-compatible',
    purpose: 'turn', policy: reserved.policy, credential: other });
  expect(allowed.id).toBe('attempt');
  expect(reserved.reserved[0]).toMatchObject({ credentialId: other.credentialId, credentialGeneration: other.generation, purpose: 'turn' });
});

it('records a 429 against the sending credential and clears it on success', async () => {
  const reserved = policy();
  const limited = await prepareRequestAttempt({ body: '{}', provider: 'openai', model: 'm', endpoint: 'openai-compatible',
    purpose: 'turn', policy: reserved.policy, credential: key });
  await limited.send('https://provider.invalid', { method: 'POST', body: '{}' },
    vi.fn(async () => new Response('{}', { status: 429, headers: { 'retry-after': '5' } })) as unknown as typeof fetch);
  expect(credentialBackoffRemaining(key)).toBeGreaterThan(0);
  expect(credentialBackoffRemaining(other)).toBe(0);

  const success = await prepareRequestAttempt({ body: '{}', provider: 'openai', model: 'm', endpoint: 'openai-compatible',
    purpose: 'turn', policy: reserved.policy, credential: other });
  noteCredentialRateLimit(other, 30_000);
  await success.send('https://provider.invalid', { method: 'POST', body: '{}' },
    vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch);
  expect(credentialBackoffRemaining(other)).toBe(0);
});

it('keeps the store bounded', () => {
  for (let index = 0; index < 700; index++) noteCredentialRateLimit({ credentialId: `p:${index}`, generation: 'aaaaaaaaaaaaaaaa' }, 1_000);
  expect(credentialBackoffRemaining({ credentialId: 'p:0', generation: 'aaaaaaaaaaaaaaaa' })).toBe(0);
  expect(credentialBackoffRemaining({ credentialId: 'p:699', generation: 'aaaaaaaaaaaaaaaa' })).toBeGreaterThan(0);
  clearCredentialBackoff({ credentialId: 'p:699', generation: 'aaaaaaaaaaaaaaaa' });
  expect(credentialBackoffRemaining({ credentialId: 'p:699', generation: 'aaaaaaaaaaaaaaaa' })).toBe(0);
});
