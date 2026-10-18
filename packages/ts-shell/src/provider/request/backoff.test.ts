import { afterEach, expect, it, vi } from 'vitest';
import { ModelAdmissionError, type PreparedRequest, type RequestPolicy } from '../../core/agent/request/model.js';
import { declareEndpoint, endpointShape } from '../endpoints/index.js';
import { prepareRequestAttempt } from './attempt.js';
import { credentialBackoffRemaining, noteCredentialRateLimit, resetCredentialBackoffForTests,
  responseBackoffMs } from './backoff.js';

afterEach(() => { resetCredentialBackoffForTests(); vi.restoreAllMocks(); });

const key = { credentialId: 'openai:work', generation: 'aaaaaaaaaaaaaaaa' };
const other = { credentialId: 'openai:personal', generation: 'bbbbbbbbbbbbbbbb' };

function policy() {
  const reserved: PreparedRequest[] = [];
  const dispatch = vi.fn(); const confirmUnsent = vi.fn();
  const value = { reserve: (request: PreparedRequest) => { reserved.push(request);
    return { id: 'attempt', dispatch, confirmUnsent, settle: () => {} }; } } as RequestPolicy;
  return { reserved, policy: value, dispatch, confirmUnsent };
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

it('a late in-flight success cannot clear a newer provider waiting deadline', async () => {
  const reserved = policy();
  const earlier = await prepareRequestAttempt({ body: '{}', provider: 'openai', model: 'm', endpoint: 'openai-compatible',
    purpose: 'turn', policy: reserved.policy, credential: key });
  let release!: (response: Response) => void;
  const pending = earlier.send('https://provider.invalid', { method: 'POST', body: '{}' },
    vi.fn(() => new Promise<Response>(resolve => { release = resolve; })) as unknown as typeof fetch);
  const limited = await prepareRequestAttempt({ body: '{}', provider: 'openai', model: 'm', endpoint: 'openai-compatible',
    purpose: 'turn', policy: reserved.policy, credential: key });
  await limited.send('https://provider.invalid', { method: 'POST', body: '{}' },
    vi.fn(async () => new Response('{}', { status: 429, headers: { 'retry-after': '5' } })) as unknown as typeof fetch);
  expect(credentialBackoffRemaining(key)).toBeGreaterThan(0);
  expect(credentialBackoffRemaining(other)).toBe(0);
  release(new Response('{}', { status: 200 })); await pending;
  expect(credentialBackoffRemaining(key)).toBeGreaterThan(0);
  expect(reserved.dispatch).toHaveBeenCalledTimes(2);
  expect(reserved.confirmUnsent).not.toHaveBeenCalled();
});

it('retains every active deadline and prunes expired records', () => {
  for (let index = 0; index < 700; index++) noteCredentialRateLimit({ credentialId: `p:${index}`, generation: 'aaaaaaaaaaaaaaaa' }, 1_000, 0);
  expect(credentialBackoffRemaining({ credentialId: 'p:0', generation: 'aaaaaaaaaaaaaaaa' }, 1)).toBe(999);
  expect(credentialBackoffRemaining({ credentialId: 'p:699', generation: 'aaaaaaaaaaaaaaaa' }, 1)).toBe(999);
  noteCredentialRateLimit(other, 10_000, 2_000);
  expect(credentialBackoffRemaining({ credentialId: 'p:699', generation: 'aaaaaaaaaaaaaaaa' }, 2_000)).toBe(0);
});

it('shorter and out-of-order rate limits preserve the longest provider deadline', () => {
  noteCredentialRateLimit(key, 60_000, 10_000);
  noteCredentialRateLimit(key, 1_000, 20_000);
  noteCredentialRateLimit(key, 5_000, 0);
  expect(credentialBackoffRemaining(key, 20_000)).toBe(50_000);
  expect(credentialBackoffRemaining(other, 20_000)).toBe(0);
});

it('preserves provider waits beyond one day and keeps deadline arithmetic finite', () => {
  const delay = 2 * 24 * 60 * 60_000;
  noteCredentialRateLimit(key, delay, 1_000);
  expect(credentialBackoffRemaining(key, 1_000)).toBe(delay);
  noteCredentialRateLimit(other, Number.MAX_VALUE, Number.MAX_VALUE / 2);
  expect(Number.isFinite(credentialBackoffRemaining(other, 1_000))).toBe(true);
  expect(credentialBackoffRemaining(other, 1_000)).toBeGreaterThan(delay);
});

it('retains a wait when positive Retry-After seconds overflow during millisecond conversion', async () => {
  const headers = new Headers({ 'retry-after': '1e308' });
  const delay = responseBackoffMs(headers);
  expect(delay).toBe(Number.MAX_VALUE);
  const reserved = policy();
  const limited = await prepareRequestAttempt({ body: '{}', provider: 'openai', model: 'm', endpoint: 'openai-compatible',
    purpose: 'turn', policy: reserved.policy, credential: key });
  await limited.send('https://provider.invalid', { method: 'POST', body: '{}' },
    vi.fn(async () => new Response('{}', { status: 429, headers })) as unknown as typeof fetch);
  expect(credentialBackoffRemaining(key)).toBeGreaterThan(60_000);
  expect(Number.isFinite(credentialBackoffRemaining(key))).toBe(true);
  expect(credentialBackoffRemaining(other)).toBe(0);
  await expect(prepareRequestAttempt({ body: '{}', provider: 'openai', model: 'm', endpoint: 'openai-compatible',
    purpose: 'turn', policy: reserved.policy, credential: key })).rejects.toThrow(/rate limited/i);
  expect(reserved.reserved).toHaveLength(1);
});

it.each([false, true])('rechecks captured waiting immediately before transport handoff (transport=%s)', async transport => {
  const reserved = policy();
  const delayed = await prepareRequestAttempt({ body: '{}', provider: 'openai', model: 'm', endpoint: 'openai-compatible',
    purpose: 'summary', policy: reserved.policy, credential: key });
  noteCredentialRateLimit(key, 30_000);
  const fetchImpl = vi.fn(async () => new Response('{}')) as unknown as typeof fetch;
  await expect(delayed.send('https://provider.invalid', { method: 'POST', body: '{}' }, fetchImpl,
    transport ? async (input, init, beforeDispatch) => { beforeDispatch(); return fetchImpl(input, init); } : undefined))
    .rejects.toThrow(/rate limited/i);
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(reserved.dispatch).not.toHaveBeenCalled();
  expect(reserved.confirmUnsent).toHaveBeenCalledOnce();
});

it('rechecks waiting after asynchronous proof and before reserving ledger capacity', async () => {
  let release!: () => void;
  declareEndpoint('delayed-backoff-test', { ...endpointShape('openai-compatible'), requestBound: async () => {
    await new Promise<void>(resolve => { release = resolve; });
    return { inputTokens: 1, outputTokens: 1, source: 'synthetic', version: '1' };
  } });
  const reserved = policy();
  const pending = prepareRequestAttempt({ body: '{}', provider: 'openai', model: 'm', endpoint: 'delayed-backoff-test',
    purpose: 'summary', policy: reserved.policy, credential: key });
  noteCredentialRateLimit(key, 30_000); release();
  await expect(pending).rejects.toThrow(/rate limited/i);
  expect(reserved.reserved).toHaveLength(0);
});

it('captures the credential key instead of accepting a later mutation of the caller object', async () => {
  const supplied = { ...key }; const reserved = policy();
  const delayed = await prepareRequestAttempt({ body: '{}', provider: 'openai', model: 'm', endpoint: 'openai-compatible',
    purpose: 'summary', policy: reserved.policy, credential: supplied });
  supplied.generation = other.generation; noteCredentialRateLimit(key, 30_000);
  const fetchImpl = vi.fn(async () => new Response('{}')) as unknown as typeof fetch;
  await expect(delayed.send('https://provider.invalid', { method: 'POST', body: '{}' }, fetchImpl)).rejects.toThrow(/rate limited/i);
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(reserved.confirmUnsent).toHaveBeenCalledOnce();
});

it.each(['unknown', 'persisted'] as const)('preserves %s dispatch persistence when transport handoff fails', async persistence => {
  const reserved = policy(); reserved.dispatch.mockImplementation(() => { throw new ModelAdmissionError('unavailable', persistence); });
  const attempt = await prepareRequestAttempt({ body: '{}', provider: 'openai', model: 'm', endpoint: 'openai-compatible',
    purpose: 'turn', policy: reserved.policy, credential: key });
  const fetchImpl = vi.fn(async () => new Response('{}')) as unknown as typeof fetch;
  await expect(attempt.send('https://provider.invalid', { method: 'POST', body: '{}' }, fetchImpl)).rejects.toMatchObject({ persistence });
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(reserved.confirmUnsent).not.toHaveBeenCalled();
});

it('a sibling deadline blocks transport work already waiting to hand off', async () => {
  const reserved = policy(); const fetchImpl = vi.fn(async () => new Response('{}')) as unknown as typeof fetch;
  const attempt = await prepareRequestAttempt({ body: '{}', provider: 'openai', model: 'm', endpoint: 'openai-compatible',
    purpose: 'summary', policy: reserved.policy, credential: key });
  let release!: () => void;
  const pending = attempt.send('https://provider.invalid', { method: 'POST', body: '{}' }, fetchImpl,
    async (input, init, beforeDispatch) => { await new Promise<void>(resolve => { release = resolve; }); beforeDispatch(); return fetchImpl(input, init); });
  noteCredentialRateLimit(key, 30_000); release();
  await expect(pending).rejects.toThrow(/rate limited/i);
  expect(fetchImpl).not.toHaveBeenCalled(); expect(reserved.dispatch).not.toHaveBeenCalled();
  expect(reserved.confirmUnsent).toHaveBeenCalledOnce();
});
