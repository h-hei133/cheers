import { expect, it, vi } from 'vitest';
import { publishAccountRotation } from './publication.js';
import type { AccountRotation } from '../../core/auth/account/contract.js';

const rotation: AccountRotation = {
  resolution: { provider: 'openai', expectedEnvVarName: 'OPENAI_API_KEY' },
  accountAuth: { type: 'openai-chatgpt-account', accountId: 'fixture', accessToken: 'synthetic', refreshToken: 'synthetic', expiresAt: 1 },
  storage: { source: 'fixture', path: 'fixture', previousRevision: 'old', revision: 'new' },
};

it.each(['before', 'after', 'omitted', 'repeated'] as const)('publishes exactly once when the observer is %s', scenario => {
  const publish = vi.fn(() => true);
  publishAccountRotation(rotation, publish, (receipt, apply) => {
    expect(receipt).toBe(rotation);
    if (scenario === 'before') throw new Error('Observer failed before publication');
    if (scenario === 'omitted') return;
    expect(apply()).toBe(true);
    if (scenario === 'after') throw new Error('Observer failed after publication');
    expect(apply()).toBe(true);
  });
  expect(publish).toHaveBeenCalledOnce();
});

it('notifies observers of a stored publication without fabricating rotation evidence', () => {
  const observer = vi.fn(); const publish = vi.fn();
  publishAccountRotation(undefined, publish, observer);
  expect(observer).toHaveBeenCalledOnce(); expect(observer).toHaveBeenCalledWith(undefined, expect.any(Function));
  expect(publish).toHaveBeenCalledOnce();
});

it('preserves a publication failure even if the observer catches it', () => {
  const failure = new Error('Publication failed');
  const publish = vi.fn(() => { throw failure; });
  expect(() => publishAccountRotation(rotation, publish, (_receipt, apply) => {
    try { apply(); } catch { /* A consumer cannot turn persistence failure into approval. */ }
  })).toThrow(failure);
  expect(publish).toHaveBeenCalledOnce();
});
