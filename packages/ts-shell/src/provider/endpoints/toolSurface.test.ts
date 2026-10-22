import { expect, it } from 'vitest';
import type { ToolDefinition } from '../../tools/types.js';
import { toolWireSurface } from './toolSurface.js';

const tool: ToolDefinition = {
  name: 'read',
  description: 'Read a file',
  argsSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  execute: async () => ({ success: true, output: '' }),
};

it.each([
  ['openai-compatible', (value: unknown) => expect(value).toMatchObject([{ type: 'function', function: { name: 'read' } }])],
  ['openai-responses', (value: unknown) => expect(value).toMatchObject([{ type: 'function', name: 'read' }])],
  ['anthropic-messages', (value: unknown) => expect(value).toMatchObject([{ name: 'read', input_schema: { type: 'object' } }])],
  ['google-generative-ai', (value: unknown) => expect(value).toMatchObject([{ functionDeclarations: [{ name: 'read' }] }])],
  ['bedrock-converse-stream', (value: unknown) => expect(value).toMatchObject([{ toolSpec: { name: 'read', inputSchema: { json: { type: 'object' } } } }])],
] as const)('serializes the %s tool declaration in its protocol shape', (endpoint, assert) => {
  const surface = toolWireSurface([tool], endpoint);
  assert(JSON.parse(surface.text));
  expect(surface.bytes).toBeGreaterThan(0);
  expect(surface.characters).toBe(surface.text.length);
});
