import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { providerRequestTarget } from './requestTarget.js';
import { requestReplayBinding } from '../../provider/request/replay.js';

it('captures the same credential and replay identity used by a provider request', () => {
  const apiKey = 'synthetic-request-target';
  const baseUrl = 'https://fixture.invalid/v1';
  const resolution = {
    provider: 'openai' as const,
    model: 'm',
    baseUrl,
    credential: {
      provider: 'openai' as const,
      authMode: 'api-key' as const,
      apiKey,
      model: 'm',
      baseUrl,
      source: 'config' as const,
      envVarName: 'OPENAI_API_KEY',
    },
  };

  const target = providerRequestTarget({ workspaceRoot: '/workspace', resolution, baseUrl, endpoint: 'openai-responses' });
  const generation = createHash('sha256').update(apiKey).digest('hex').slice(0, 16);

  expect(target).toMatchObject({
    headers: { Authorization: `Bearer ${apiKey}` },
    credentialId: 'openai:config',
    credentialGeneration: generation,
  });
  expect(target.replayBinding).toBe(requestReplayBinding({
    provider: 'openai',
    endpoint: 'openai-responses',
    baseUrl,
    headers: target.headers,
    credentialId: 'openai:config',
    credentialGeneration: generation,
  }));
});
