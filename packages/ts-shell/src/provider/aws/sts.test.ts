import { expect, it, vi } from 'vitest';
import { CredentialsError } from './credentials.js';
import { assumeRole, assumeRoleWithWebIdentity } from './sts.js';

it.each(['role', 'web identity'] as const)('excludes an arbitrary error body from the %s credential failure', async kind => {
  const pull = vi.fn(controller => {
    controller.enqueue(new TextEncoder().encode('<Message>PRIVATE_STS_RESPONSE</Message>'));
    controller.close();
  });
  const cancel = vi.fn(() => Promise.reject(new Error('PRIVATE_CLEANUP_DETAIL')));
  const response = new Response(new ReadableStream({ pull, cancel }, { highWaterMark: 0 }), { status: 403 });
  const text = vi.spyOn(response, 'text');
  const fetchImpl = vi.fn(async () => response) as unknown as typeof fetch;
  const parent = new AbortController();
  const options = { fetchImpl, signal: parent.signal };
  const attempt = kind === 'role'
    ? assumeRole({ role_arn: 'arn:aws:iam::1:role/fixture' }, { accessKeyId: 'FIXTURE_KEY', secretAccessKey: 'FIXTURE_SECRET' }, options)
    : assumeRoleWithWebIdentity({ roleArn: 'arn:aws:iam::1:role/fixture', token: 'FIXTURE_IDENTITY' }, 'us-east-1', options);
  const error = await attempt.catch(error => error);
  const source = kind === 'role' ? 'assume role' : 'web identity';
  expect(error).toBeInstanceOf(CredentialsError);
  expect(error.source).toBe(source);
  expect(error.message).toBe(`the ${source} request failed (HTTP 403)`);
  expect(JSON.stringify({ message: error.message, source: error.source })).not.toContain('PRIVATE_');
  expect(fetchImpl).toHaveBeenCalledOnce();
  expect(fetchImpl).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal: parent.signal }));
  expect(text).not.toHaveBeenCalled();
  expect(pull).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalledOnce();
});

it('does not wait for error-body cancellation to settle', async () => {
  const cancel = vi.fn(() => new Promise<void>(() => {}));
  const response = new Response(new ReadableStream({ cancel }, { highWaterMark: 0 }), { status: 503 });
  const fetchImpl = (async () => response) as typeof fetch;
  await expect(assumeRoleWithWebIdentity({ roleArn: 'fixture', token: 'FIXTURE_IDENTITY' }, 'us-east-1', { fetchImpl }))
    .rejects.toMatchObject({ source: 'web identity', message: 'the web identity request failed (HTTP 503)' });
  expect(cancel).toHaveBeenCalledOnce();
});
