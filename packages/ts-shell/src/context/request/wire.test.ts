import { expect, it } from 'vitest';
import { endpointShape, endpointTurnBody, type TurnRequest } from '../../provider/endpoints/index.js';
import { estimateWirePrompt, estimateWirePromptDetails } from './wire.js';

const request: TurnRequest = { model: 'fixture', systemPrompt: 'instructions', messages: [{ role: 'user', content: 'hello' }],
  tools: [{ type: 'function', function: { name: 'read', description: 'Read a file', parameters: { type: 'object' } } }],
  allowTools: true, vision: true, temperature: 0.7, systemRole: 'system', reasoningEffort: false,
  maxTokensField: 'max_tokens', assistantAfterToolResult: false };

it('counts transformed schemas and protocol framing from each endpoint owner', () => {
  for (const endpoint of ['openai-compatible', 'anthropic-messages', 'bedrock-converse-stream', 'google-generative-ai', 'openai-responses']) {
    const body = endpointTurnBody(endpoint, request);
    expect(estimateWirePrompt(body, endpointShape(endpoint).contextFields)).toBeGreaterThan(0);
    expect(estimateWirePrompt(endpointTurnBody(endpoint, { ...request, allowTools: false }), endpointShape(endpoint).contextFields))
      .toBeLessThan(estimateWirePrompt(body, endpointShape(endpoint).contextFields));
  }
});

it('uses image allowances after vision conversion and never counts base64 length', () => {
  for (const endpoint of ['openai-compatible', 'anthropic-messages', 'bedrock-converse-stream', 'google-generative-ai', 'openai-responses']) {
    const tokens = (data: string, vision = true) => estimateWirePrompt(endpointTurnBody(endpoint, { ...request, vision,
      messages: [{ role: 'user', content: [{ type: 'image', mimeType: 'image/png', data }] }] }), endpointShape(endpoint).contextFields);
    expect(tokens('A'.repeat(10000))).toBe(tokens('AA=='));
    expect(tokens('AA==')).toBeGreaterThan(tokens('AA==', false) + 1900);
  }
});

it('preserves schema property names and refuses opaque replay without inventing usage', () => {
  const fields = { conversation: 'messages' };
  expect(estimateWirePrompt({ messages: [], tools: { signature: { type: 'string' }, image: { type: 'string' } } }, fields)).toBeGreaterThan(0);
  expect(() => estimateWirePrompt({ messages: [{ content: [{ type: 'thinking', signature: 'opaque', thinking: 'thought' }] }] }, fields))
    .toThrow('Opaque');
  expect(() => estimateWirePrompt({ messages: [] }, undefined)).toThrow('unavailable');
});

it.each(['cl100k_base', 'o200k_base'] as const)('counts declared tokenizer %s on the actual projection while retaining image and opaque limits', tokenizer => {
  const fields = endpointShape('openai-responses').contextFields;
  const body = endpointTurnBody('openai-responses', { ...request, messages: [{ role: 'user', content: 'お誕生日おめでとう 😀' }] });
  const estimate = estimateWirePromptDetails(body, fields, tokenizer);
  expect(estimate.method).toBe(tokenizer); expect(estimate.tokens).toBeGreaterThan(0);
  expect(estimate.tokens).not.toBe(estimateWirePrompt(body, fields));
  const image = (data: string) => estimateWirePromptDetails(endpointTurnBody('openai-responses', { ...request,
    messages: [{ role: 'user', content: [{ type: 'image', mimeType: 'image/png', data }] }] }), fields, tokenizer);
  expect(image('AA==')).toEqual(image('A'.repeat(10_000)));
  expect(image('AA==').imageAllowanceTokens).toBe(2048);
  expect(() => estimateWirePromptDetails({ messages: [{ reasoning: { signature: 'opaque' } }] }, { conversation: 'messages' }, tokenizer)).toThrow('Opaque');
});
