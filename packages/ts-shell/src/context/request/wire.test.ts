import { expect, it } from 'vitest';
import { endpointShape, endpointTurnBody, type TurnRequest } from '../../provider/endpoints/index.js';
import { estimateWirePrompt, estimateWirePromptDetails } from './wire.js';
import { countRequestText } from './tokenizer.js';
import { requestContext } from './projection.js';

const request: TurnRequest = { model: 'fixture', systemPrompt: 'instructions', messages: [{ role: 'user', content: 'hello' }],
  tools: [{ type: 'function', function: { name: 'read', description: 'Read a file', parameters: { type: 'object' } } }],
  allowTools: true, vision: true, temperature: 0.7, systemRole: 'system', reasoningEffort: false,
  maxTokensField: 'max_tokens', assistantAfterToolResult: false };

const ordinaryText = 'ordinary document data Ω 😀 '.repeat(120);
const payloads = [
  { signature: ordinaryText },
  { thoughtSignature: ordinaryText },
  { reasoningContent: { text: ordinaryText } },
  { type: 'redacted_thinking', data: ordinaryText },
  { type: 'image', source: { media_type: 'image/png', data: ordinaryText } },
  { nested: [{ inlineData: { mimeType: 'image/png', data: ordinaryText } },
    { type: 'input_image', image_url: ordinaryText }, { image: { format: 'png', source: { bytes: ordinaryText } } }] },
];

it.each(['anthropic-messages', 'google-generative-ai', 'google-vertex', 'bedrock-converse-stream'].flatMap(endpoint =>
  payloads.map((payload, index) => ({ endpoint, payload, index }))))(
  'counts ordinary JSON tool arguments without interpreting protocol fields: $endpoint payload $index', ({ endpoint, payload }) => {
    const input: TurnRequest = { ...request, messages: [
      { role: 'user', content: 'inspect this document' },
      { role: 'assistant', content: '', tool_calls: [{ id: 'call_one', type: 'function',
        function: { name: 'read', arguments: JSON.stringify(payload) } }] },
      { role: 'tool', tool_call_id: 'call_one', content: 'document inspected' },
    ] };
    const body = endpointTurnBody(endpoint, input), fields = endpointShape(endpoint).contextFields!;
    const before = JSON.stringify(body);
    const estimate = estimateWirePromptDetails(body, fields);
    const raw = countRequestText([JSON.stringify(body[fields.conversation]), JSON.stringify({ ...body, [fields.conversation]: undefined })], false);
    expect(estimate).toEqual({ ...raw, imageCount: 0, imageAllowanceTokens: 0 });
    const captured = requestContext({ body: before, fields, provider: 'fixture', model: input.model, endpoint });
    expect(captured.localEstimate).toEqual({ ...raw, scope: 'assembled-request' });
    expect(JSON.stringify(captured)).not.toContain('ordinary document');
    expect(JSON.stringify(body)).toBe(before);
  });

it.each(['cl100k_base', 'o200k_base'] as const)('counts every ordinary tool argument with %s', tokenizer => {
  const body = endpointTurnBody('google-generative-ai', { ...request, messages: [{ role: 'assistant', content: '',
    tool_calls: [{ id: 'call_one', type: 'function', function: { name: 'read', arguments: JSON.stringify({ documents: payloads }) } }] }] });
  const fields = endpointShape('google-generative-ai').contextFields!;
  const raw = countRequestText([JSON.stringify(body[fields.conversation]), JSON.stringify({ ...body, [fields.conversation]: undefined })], tokenizer);
  expect(estimateWirePromptDetails(body, fields, tokenizer)).toEqual({ ...raw, imageCount: 0, imageAllowanceTokens: 0 });
});

it.each(['openai-compatible', 'anthropic-messages', 'bedrock-converse-stream', 'google-generative-ai', 'openai-responses'])(
  'retains actual tool-result images in the %s content containers', endpoint => {
    const body = (data: string) => endpointTurnBody(endpoint, { ...request, model: 'gemini-3-fixture', messages: [
      { role: 'assistant', content: '', tool_calls: [{ id: 'call_one', type: 'function', function: { name: 'read', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'call_one', content: [{ type: 'image', mimeType: 'image/png', data }] },
    ] });
    const fields = endpointShape(endpoint).contextFields;
    const estimate = estimateWirePromptDetails(body('AA=='), fields);
    expect(estimate.imageCount).toBe(1); expect(estimate.imageAllowanceTokens).toBe(2048);
    expect(estimateWirePromptDetails(body('A'.repeat(20_000)), fields)).toEqual(estimate);
  });

it.each([
  { conversation: 'messages', message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'thought', signature: 'opaque' }] } },
  { conversation: 'messages', message: { role: 'assistant', content: [{ reasoningContent: { reasoningText: { text: 'thought', signature: 'opaque' } } }] } },
  { conversation: 'contents', message: { role: 'model', parts: [{ text: 'thought', thoughtSignature: 'opaque' }] } },
  { conversation: 'input', message: { type: 'reasoning', encrypted_content: 'opaque' } },
])('withholds actual opaque protocol content in $conversation', ({ conversation, message }) => {
  const body = { [conversation]: [message] }, fields = { conversation };
  expect(() => estimateWirePromptDetails(body, fields)).toThrow('Opaque reasoning');
  expect(requestContext({ body: JSON.stringify(body), fields, endpoint: 'fixture', provider: 'fixture', model: 'fixture' })
    .localEstimate).toBeUndefined();
});

it('counts literal result JSON while retaining nested Google tool-result images', () => {
  const body = { contents: [{ role: 'user', parts: [{ functionResponse: { name: 'read',
    response: { signature: ordinaryText, inlineData: { data: ordinaryText } },
    parts: [{ inlineData: { mimeType: 'image/png', data: 'AA==' } }],
  } }] }] };
  const estimate = estimateWirePromptDetails(body, { conversation: 'contents' });
  expect(estimate.imageCount).toBe(1);
  expect(estimate.tokens).toBeGreaterThan(2048 + ordinaryText.length / 3.5);
});

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
