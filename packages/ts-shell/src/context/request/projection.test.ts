import { expect, it } from 'vitest';
import { endpointShape, type TurnRequest } from '../../provider/endpoints/index.js';
import { textSize } from './measure.js';
import { requestContext } from './projection.js';
import { IMAGE_ESTIMATE_TOKENS } from '../../session/context.js';

const input: TurnRequest = {
  model: 'fixture', systemPrompt: '规则🔒\n"quoted"', messages: [{ role: 'user', content: '问题\\路径' }],
  tools: [{ type: 'function', function: { name: 'read', description: '读取', parameters: { type: 'object' } } }],
  allowTools: true, vision: false, temperature: 0.2, systemRole: 'developer', reasoningEffort: false,
  maxTokensField: 'max_tokens', assistantAfterToolResult: false,
};

it.each(['openai-compatible', 'openai-responses', 'openai-account-responses', 'anthropic-messages',
  'google-generative-ai', 'google-vertex', 'bedrock-converse-stream'])(
  'measures the actual %s protocol body and its withdrawn tool state', endpoint => {
    const shape = endpointShape(endpoint);
    for (const allowTools of [true, false]) {
      const body = JSON.stringify(shape.turnBody({ ...input, allowTools }));
      const observation = requestContext({ body, endpoint, provider: 'fixture', model: input.model, fields: shape.contextFields });
      expect(observation.body).toEqual({ bytes: Buffer.byteLength(body), codeUnits: body.length });
      expect(observation.parts).toBeDefined();
      expect(observation.localEstimate).toMatchObject({ method: 'characters/3.5', scope: 'assembled-request' });
      expect(observation.localEstimate!.tokens).toBeGreaterThan(0);
      const parts = Object.values(observation.parts!);
      expect(parts.reduce((sum, part) => sum + part.bytes, 0)).toBe(Buffer.byteLength(body));
      expect(parts.reduce((sum, part) => sum + part.codeUnits, 0)).toBe(body.length);
      expect(observation.parts!.system.bytes).toBeGreaterThan(0);
      expect(observation.parts!.conversation.bytes).toBeGreaterThan(0);
      expect(observation.parts!.tools.bytes > 0).toBe(allowTools);
      expect(JSON.stringify(observation)).not.toContain('规则');
      expect(JSON.stringify(observation)).not.toContain('问题');
      expect(Object.isFrozen(observation.parts!.envelope)).toBe(true);
    }
  });

it('retains only totals for unknown or incompatible ownership declarations', () => {
  for (const fields of [undefined, { conversation: 'missing' }, { conversation: 'messages', tools: 'messages' },
    { conversation: 'messages', firstMessageIsSystem: true }]) {
    const body = JSON.stringify({ messages: [{ role: 'user', content: 'only user' }] });
    const observation = requestContext({ body, fields, provider: '', model: 'fixture', endpoint: 'extension' });
    expect(observation.body).toEqual(textSize(body));
    expect(observation.parts).toBeUndefined();
    expect(observation.localEstimate).toBeUndefined();
  }
});

it('locks the assembled estimate and keeps image payload length out of the count', () => {
  const fields = { conversation: 'messages' };
  const textBody = JSON.stringify({ messages: [{ role: 'user', content: '1234567' }], model: 'm' });
  expect(requestContext({ body: textBody, fields, provider: 'fixture', model: 'm', endpoint: 'fixture' })
    .localEstimate?.tokens).toBe(15);
  const image = (data: string) => JSON.stringify({ messages: [{ role: 'user', content: [
    { type: 'image', source: { media_type: 'image/png', data } },
  ] }] });
  const short = requestContext({ body: image('AA=='), fields, provider: 'fixture', model: 'm', endpoint: 'fixture' }).localEstimate!;
  const long = requestContext({ body: image('A'.repeat(100_000)), fields, provider: 'fixture', model: 'm', endpoint: 'fixture' }).localEstimate!;
  expect(short).toMatchObject({ image: { count: 1, allowanceTokens: IMAGE_ESTIMATE_TOKENS } });
  expect(long.tokens).toBe(short.tokens);
});

it('withholds an assembled estimate for opaque reasoning', () => {
  const body = JSON.stringify({ messages: [{ role: 'assistant', content: 'answer', reasoning: { signature: 'opaque' } }] });
  expect(requestContext({ body, fields: { conversation: 'messages' }, provider: 'fixture', model: 'm', endpoint: 'fixture' })
    .localEstimate).toBeUndefined();
});
