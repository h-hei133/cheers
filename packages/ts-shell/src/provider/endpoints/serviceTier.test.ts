import { expect, it } from 'vitest';
import './openaiCompatible.js';
import { endpointBody, endpointTurnBody } from './index.js';

it('propagates a selected service tier on the OpenAI-compatible request', () => {
  const body = endpointTurnBody('openai-compatible', { model: 'm', systemPrompt: '', messages: [], tools: [], allowTools: false, vision: false, temperature: 0.7, systemRole: 'system', reasoningEffort: false, maxTokensField: 'max_tokens', assistantAfterToolResult: false, serviceTier: 'priority' });
  expect(body.service_tier).toBe('priority');
});

it.each(['openai-compatible', 'openai-responses'] as const)('propagates the selected tier on a simple %s request', endpoint => {
  expect(endpointBody(endpoint, { model: 'm', messages: [], serviceTier: 'flex' }).service_tier).toBe('flex');
  expect(endpointBody(endpoint, { model: 'm', messages: [] })).not.toHaveProperty('service_tier');
});
