import { expect, it } from 'vitest';
import { endpointShape, type TurnRequest } from '../../provider/endpoints/index.js';
import { textSize } from './measure.js';
import { requestContext } from './projection.js';

const input: TurnRequest = {
  model: 'fixture', systemPrompt: '规则🔒\n"quoted"', messages: [{ role: 'user', content: '问题\\路径' }],
  tools: [{ type: 'function', function: { name: 'read', description: '读取', parameters: { type: 'object' } } }],
  allowTools: true, vision: false, temperature: 0.2, systemRole: 'developer', reasoningEffort: false,
  maxTokensField: 'max_tokens', assistantAfterToolResult: false,
};

it.each(['openai-compatible', 'anthropic-messages', 'google-generative-ai', 'google-vertex', 'bedrock-converse-stream'])(
  'measures the actual %s protocol body and its withdrawn tool state', endpoint => {
    const shape = endpointShape(endpoint);
    for (const allowTools of [true, false]) {
      const body = JSON.stringify(shape.turnBody({ ...input, allowTools }));
      const observation = requestContext({ body, endpoint, provider: 'fixture', model: input.model, fields: shape.contextFields });
      expect(observation.body).toEqual({ bytes: Buffer.byteLength(body), codeUnits: body.length });
      expect(observation.parts).toBeDefined();
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
  }
});
