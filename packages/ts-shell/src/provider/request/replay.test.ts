import { expect, it } from 'vitest';
import { requestReplayBinding } from './replay.js';

const input = { provider: 'openai', endpoint: 'openai-responses', baseUrl: 'https://fixture.test/v1',
  credentialId: 'connection-a', credentialGeneration: 'generation-a', headers: { Authorization: 'Bearer SYNTHETIC_PRIVATE' } };

it.each(['provider', 'endpoint', 'baseUrl', 'credentialId', 'credentialGeneration'])('opaque replay cannot move across %s', field => {
  expect(requestReplayBinding({ ...input, [field]: 'other' })).not.toBe(requestReplayBinding(input));
});
it('normalizes captured header case and trailing slashes without retaining credentials', () => {
  const binding = requestReplayBinding(input);
  expect(binding).toMatch(/^[a-f0-9]{64}$/); expect(binding).not.toContain('PRIVATE');
  expect(requestReplayBinding({ ...input, baseUrl: ' https://fixture.test/v1/ ', headers: { authorization: 'Bearer SYNTHETIC_PRIVATE' } })).toBe(binding);
  expect(requestReplayBinding({ ...input, headers: { Authorization: 'Bearer different' } })).not.toBe(binding);
});
