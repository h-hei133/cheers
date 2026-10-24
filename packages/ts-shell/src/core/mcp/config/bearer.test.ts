import { expect, it } from 'vitest';
import { mcpServerDefinition } from './definition.js';

it('retains only the named HTTP bearer environment reference', () => {
  expect(mcpServerDefinition({ url: 'https://example.invalid/mcp', bearerTokenEnvVar: 'CHEERS_MCP_TEST_BEARER' }))
    .toMatchObject({ transport: 'http', bearerTokenEnvVar: 'CHEERS_MCP_TEST_BEARER' });
});

it.each([null, 7, '', ' ', 'A-B', '1TOKEN', 'TOKEN\n', 'x'.repeat(129)])('rejects an invalid bearer variable name (%j)', name => {
  expect(() => mcpServerDefinition({ url: 'https://example.invalid/mcp', bearerTokenEnvVar: name })).toThrow();
});

it.each(['Authorization', 'authorization', 'AUTHORIZATION'])('rejects competing credential sources (%s)', header => {
  expect(() => mcpServerDefinition({ url: 'https://example.invalid/mcp', bearerTokenEnvVar: 'CHEERS_MCP_TEST_BEARER',
    headers: { [header]: 'Bearer synthetic' } })).toThrow();
});

it.each(['stdio', 'ws', 'sdk'])('does not attach an HTTP bearer source to %s', transport => {
  expect(() => mcpServerDefinition({ transport, command: transport === 'stdio' ? 'local' : undefined,
    bearerTokenEnvVar: 'CHEERS_MCP_TEST_BEARER' })).toThrow();
});
